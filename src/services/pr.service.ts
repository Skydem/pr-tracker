import { prisma } from "../db/client.js";
import { userService } from "./user.service.js";
import type {
  PullRequest,
  PRReviewer,
  PRState,
  ReviewStatus,
  EventType,
} from "@prisma/client";
import type {
  BitbucketPullRequest,
  BitbucketUser,
} from "../types/bitbucket.types.js";

export interface PRWithReviewers extends PullRequest {
  reviewers: (PRReviewer & { user: { displayName: string; slackUserId: string | null } })[];
  author: { displayName: string; slackUserId: string | null };
}

export class PRService {
  async createOrUpdatePR(
    prData: BitbucketPullRequest,
    workspaceSlug: string
  ): Promise<PRWithReviewers> {
    const author = await userService.findOrCreateUser(
      prData.author.uuid,
      null,
      prData.author.display_name
    );

    const existingPR = await prisma.pullRequest.findUnique({
      where: {
        bitbucketId_repositorySlug_workspaceSlug: {
          bitbucketId: prData.id,
          repositorySlug: prData.destination.repository.name,
          workspaceSlug,
        },
      },
    });

    const prState = this.mapPRState(prData.state);

    let pr: PullRequest;

    if (existingPR) {
      pr = await prisma.pullRequest.update({
        where: { id: existingPR.id },
        data: {
          title: prData.title,
          sourceBranch: prData.source.branch.name,
          destBranch: prData.destination.branch.name,
          state: prState,
          url: prData.links?.html?.href,
        },
      });
    } else {
      pr = await prisma.pullRequest.create({
        data: {
          bitbucketId: prData.id,
          repositorySlug: prData.destination.repository.name,
          workspaceSlug,
          title: prData.title,
          sourceBranch: prData.source.branch.name,
          destBranch: prData.destination.branch.name,
          state: prState,
          url: prData.links?.html?.href,
          authorId: author.id,
        },
      });
    }

    await this.syncReviewers(pr.id, prData.reviewers);

    return this.getPRWithReviewers(pr.id);
  }

  private async syncReviewers(
    pullRequestId: string,
    reviewers: BitbucketUser[]
  ): Promise<void> {
    const existingReviewers = await prisma.pRReviewer.findMany({
      where: { pullRequestId },
      include: { user: true },
    });

    const users = await Promise.all(
      reviewers.map((r) =>
        userService.findOrCreateUser(r.uuid, null, r.display_name)
      )
    );

    const existingUserIds = new Set(existingReviewers.map((r) => r.userId));
    const newReviewerUuids = new Set(reviewers.map((r) => r.uuid));

    const newReviewerData = users
      .filter((u) => !existingUserIds.has(u.id))
      .map((u) => ({
        pullRequestId,
        userId: u.id,
        status: "PENDING" as const,
      }));

    if (newReviewerData.length > 0) {
      await prisma.pRReviewer.createMany({ data: newReviewerData });
    }

    const removedIds = existingReviewers
      .filter(
        (er) => er.user.bitbucketUuid && !newReviewerUuids.has(er.user.bitbucketUuid)
      )
      .map((er) => er.id);

    if (removedIds.length > 0) {
      await prisma.pRReviewer.deleteMany({ where: { id: { in: removedIds } } });
    }
  }

  async updateReviewerStatus(
    pullRequestId: string,
    bitbucketUuid: string,
    status: ReviewStatus
  ): Promise<void> {
    const user = await userService.getUserByBitbucketUuid(bitbucketUuid);
    if (!user) return;

    await prisma.pRReviewer.updateMany({
      where: {
        pullRequestId,
        userId: user.id,
      },
      data: { status },
    });
  }

  async logEvent(
    pullRequestId: string,
    eventType: EventType,
    actorUuid: string,
    payload?: object
  ): Promise<void> {
    const actor = await userService.getUserByBitbucketUuid(actorUuid);
    if (!actor) return;

    await prisma.pREvent.create({
      data: {
        pullRequestId,
        eventType,
        actorId: actor.id,
        payload: payload ?? undefined,
      },
    });
  }

  async getPRWithReviewers(prId: string): Promise<PRWithReviewers> {
    const pr = await prisma.pullRequest.findUniqueOrThrow({
      where: { id: prId },
      include: {
        reviewers: {
          include: {
            user: {
              select: { displayName: true, slackUserId: true },
            },
          },
        },
        author: {
          select: { displayName: true, slackUserId: true },
        },
      },
    });

    return pr as PRWithReviewers;
  }

  async getPRByBitbucketId(
    bitbucketId: number,
    repositorySlug: string,
    workspaceSlug: string
  ): Promise<PRWithReviewers | null> {
    const pr = await prisma.pullRequest.findUnique({
      where: {
        bitbucketId_repositorySlug_workspaceSlug: {
          bitbucketId,
          repositorySlug,
          workspaceSlug,
        },
      },
      include: {
        reviewers: {
          include: {
            user: {
              select: { displayName: true, slackUserId: true },
            },
          },
        },
        author: {
          select: { displayName: true, slackUserId: true },
        },
      },
    });

    return pr as PRWithReviewers | null;
  }

  async getUserPRs(userId: string): Promise<PRWithReviewers[]> {
    const prs = await prisma.pullRequest.findMany({
      where: {
        authorId: userId,
        state: "OPEN",
      },
      include: {
        reviewers: {
          include: {
            user: {
              select: { displayName: true, slackUserId: true },
            },
          },
        },
        author: {
          select: { displayName: true, slackUserId: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return prs as PRWithReviewers[];
  }

  async getPRsAwaitingReview(userId: string): Promise<PRWithReviewers[]> {
    const reviews = await prisma.pRReviewer.findMany({
      where: {
        userId,
        status: "PENDING",
        pullRequest: {
          state: "OPEN",
        },
      },
      include: {
        pullRequest: {
          include: {
            reviewers: {
              include: {
                user: {
                  select: { displayName: true, slackUserId: true },
                },
              },
            },
            author: {
              select: { displayName: true, slackUserId: true },
            },
          },
        },
      },
      orderBy: { pullRequest: { updatedAt: "desc" } },
    });

    return reviews.map((r) => r.pullRequest) as PRWithReviewers[];
  }

  async areAllReviewersApproved(pullRequestId: string): Promise<boolean> {
    const reviewers = await prisma.pRReviewer.findMany({
      where: { pullRequestId },
    });

    if (reviewers.length === 0) return false;

    return reviewers.every((r) => r.status === "APPROVED");
  }

  async getReviewersWithStatus(
    pullRequestId: string,
    status: ReviewStatus
  ): Promise<{ userId: string; slackUserId: string | null }[]> {
    const reviewers = await prisma.pRReviewer.findMany({
      where: {
        pullRequestId,
        status,
      },
      include: {
        user: {
          select: { id: true, slackUserId: true },
        },
      },
    });

    return reviewers.map((r) => ({
      userId: r.user.id,
      slackUserId: r.user.slackUserId,
    }));
  }

  async updatePRState(pullRequestId: string, state: PRState): Promise<void> {
    await prisma.pullRequest.update({
      where: { id: pullRequestId },
      data: { state },
    });
  }

  private mapPRState(state: string): PRState {
    switch (state) {
      case "MERGED":
        return "MERGED";
      case "DECLINED":
      case "SUPERSEDED":
        return "DECLINED";
      default:
        return "OPEN";
    }
  }
}

export const prService = new PRService();
