import { prService, type PRWithReviewers } from "./pr.service.js";
import { slackService } from "./slack.service.js";
import { userService } from "./user.service.js";

export class NotificationService {
  private async isUserMuted(slackUserId: string): Promise<boolean> {
    const { prisma } = await import("../db/client.js");
    const user = await prisma.user.findUnique({
      where: { slackUserId },
      select: { notificationsMuted: true },
    });
    return user?.notificationsMuted ?? false;
  }

  async notifyReviewersOnPRCreated(pr: PRWithReviewers): Promise<void> {
    const { blocks, text } = slackService.buildPRCreatedMessage(pr);

    for (const reviewer of pr.reviewers) {
      const slackUserId = reviewer.user.slackUserId;
      if (slackUserId && !(await this.isUserMuted(slackUserId))) {
        await slackService.sendDM(slackUserId, blocks, text);
      }
    }
  }

  async notifyReviewersOnPRUpdated(pr: PRWithReviewers): Promise<void> {
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
  }

  async notifyAuthorOnChangesRequested(
    pr: PRWithReviewers,
    reviewerName: string
  ): Promise<void> {
    const authorSlackId = pr.author.slackUserId;
    if (!authorSlackId || (await this.isUserMuted(authorSlackId))) return;

    const { blocks, text } = slackService.buildChangesRequestedMessage(
      pr,
      reviewerName
    );

    await slackService.sendDM(authorSlackId, blocks, text);
  }

  async notifyAuthorOnAllApproved(pr: PRWithReviewers): Promise<void> {
    const allApproved = await prService.areAllReviewersApproved(pr.id);
    if (!allApproved) return;

    const authorSlackId = pr.author.slackUserId;
    if (!authorSlackId || (await this.isUserMuted(authorSlackId))) return;

    const { blocks, text } = slackService.buildAllApprovedMessage(pr);

    await slackService.sendDM(authorSlackId, blocks, text);
  }

  async notifyAuthorOnComment(
    pr: PRWithReviewers,
    commenterUuid: string,
    commenterName: string
  ): Promise<void> {
    const author = await userService.getUserByBitbucketUuid(
      pr.author.slackUserId ?? ""
    );

    const prFull = await prService.getPRWithReviewers(pr.id);
    const authorUser = await prismaUserById(prFull.authorId);

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
  }

  async nudgeReviewers(pr: PRWithReviewers): Promise<number> {
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
  }
}

async function prismaUserById(id: string) {
  const { prisma } = await import("../db/client.js");
  return prisma.user.findUnique({ where: { id } });
}

export const notificationService = new NotificationService();
