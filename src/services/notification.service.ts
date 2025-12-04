import { prService, type PRWithReviewers } from "./pr.service.js";
import { slackService } from "./slack.service.js";

export class NotificationService {
  private async isUserMuted(slackUserId: string): Promise<boolean> {
    const { prisma } = await import("../db/client.js");
    const user = await prisma.user.findUnique({
      where: { slackUserId },
      select: { notificationsMuted: true },
    });
    return user?.notificationsMuted ?? false;
  }

  private async getWatchers(excludeSlackUserIds: string[] = []): Promise<string[]> {
    const { prisma } = await import("../db/client.js");
    const watchers = await prisma.user.findMany({
      where: {
        isWatcher: true,
        notificationsMuted: false,
        slackUserId: { not: null },
      },
      select: { slackUserId: true },
    });
    return watchers
      .map((w) => w.slackUserId!)
      .filter((id) => !excludeSlackUserIds.includes(id));
  }

  async notifyReviewersOnPRCreated(pr: PRWithReviewers): Promise<void> {
    try {
      const { blocks, text } = slackService.buildPRCreatedMessage(pr);
      const notifiedSlackIds: string[] = [];

      for (const reviewer of pr.reviewers) {
        const slackUserId = reviewer.user.slackUserId;
        if (slackUserId && !(await this.isUserMuted(slackUserId))) {
          await slackService.sendDM(slackUserId, blocks, text);
          notifiedSlackIds.push(slackUserId);
        }
      }

      const watchers = await this.getWatchers(notifiedSlackIds);
      for (const watcherSlackId of watchers) {
        await slackService.sendDM(watcherSlackId, blocks, text);
      }
    } catch (error) {
      console.error(`[NotificationService] Failed to notify reviewers for PR ${pr.id}:`, error);
    }
  }

  async notifyReviewersOnPRUpdated(pr: PRWithReviewers): Promise<void> {
    try {
      const reviewersWithChangesRequested = await prService.getReviewersWithStatus(
        pr.id,
        "CHANGES_REQUESTED"
      );

      if (reviewersWithChangesRequested.length === 0) return;

      const { blocks, text } = slackService.buildPRUpdatedMessage(pr);

      for (const reviewer of reviewersWithChangesRequested) {
        if (reviewer.slackUserId && !(await this.isUserMuted(reviewer.slackUserId))) {
          await slackService.sendDM(reviewer.slackUserId, blocks, text);
        }
      }
    } catch (error) {
      console.error(`[NotificationService] Failed to notify reviewers on PR update ${pr.id}:`, error);
    }
  }

  async notifyAuthorOnChangesRequested(
    pr: PRWithReviewers,
    reviewerName: string
  ): Promise<void> {
    try {
      const authorSlackId = pr.author.slackUserId;
      if (!authorSlackId || (await this.isUserMuted(authorSlackId))) return;

      const { blocks, text } = slackService.buildChangesRequestedMessage(
        pr,
        reviewerName
      );

      await slackService.sendDM(authorSlackId, blocks, text);
    } catch (error) {
      console.error(`[NotificationService] Failed to notify author on changes requested for PR ${pr.id}:`, error);
    }
  }

  async notifyAuthorOnAllApproved(pr: PRWithReviewers): Promise<void> {
    try {
      const allApproved = await prService.areAllReviewersApproved(pr.id);
      if (!allApproved) return;

      const { blocks, text } = slackService.buildAllApprovedMessage(pr);
      const notifiedSlackIds: string[] = [];

      const authorSlackId = pr.author.slackUserId;
      if (authorSlackId && !(await this.isUserMuted(authorSlackId))) {
        await slackService.sendDM(authorSlackId, blocks, text);
        notifiedSlackIds.push(authorSlackId);
      }

      const watchers = await this.getWatchers(notifiedSlackIds);
      for (const watcherSlackId of watchers) {
        await slackService.sendDM(watcherSlackId, blocks, text);
      }
    } catch (error) {
      console.error(`[NotificationService] Failed to notify author on all approved for PR ${pr.id}:`, error);
    }
  }

  async notifyAuthorOnComment(
    pr: PRWithReviewers,
    commenterUuid: string,
    commenterName: string
  ): Promise<void> {
    try {
      const authorUser = await prismaUserById(pr.authorId);

      if (!authorUser?.bitbucketUuid || authorUser.bitbucketUuid === commenterUuid) {
        return;
      }

      const authorSlackId = pr.author.slackUserId;
      if (!authorSlackId || (await this.isUserMuted(authorSlackId))) return;

      const { blocks, text } = slackService.buildCommentAddedMessage(
        pr,
        commenterName
      );

      await slackService.sendDM(authorSlackId, blocks, text);
    } catch (error) {
      console.error(`[NotificationService] Failed to notify author on comment for PR ${pr.id}:`, error);
    }
  }

  async nudgeReviewers(pr: PRWithReviewers): Promise<number> {
    try {
      const pendingReviewers = await prService.getReviewersWithStatus(
        pr.id,
        "PENDING"
      );

      const { blocks, text } = slackService.buildNudgeMessage(pr);
      let notifiedCount = 0;

      for (const reviewer of pendingReviewers) {
        if (reviewer.slackUserId && !(await this.isUserMuted(reviewer.slackUserId))) {
          await slackService.sendDM(reviewer.slackUserId, blocks, text);
          notifiedCount++;
        }
      }

      return notifiedCount;
    } catch (error) {
      console.error(`[NotificationService] Failed to nudge reviewers for PR ${pr.id}:`, error);
      return 0;
    }
  }
}

async function prismaUserById(id: string) {
  const { prisma } = await import("../db/client.js");
  return prisma.user.findUnique({ where: { id } });
}

export const notificationService = new NotificationService();
