import type { EventType } from "@prisma/client";
import { prisma } from "../db/client.js";
import { config } from "../config/env.js";
import {
  deriveReviewerState,
  derivePRState,
  comparePRState,
  isAwaitingAction,
  isStale,
  type PRHeadlineState,
  type ReviewEvent,
  type ReviewerState,
} from "../utils/review-state.js";
import { describeActivity } from "../utils/activity.js";

export interface BoardReviewer {
  userId: string;
  displayName: string;
  state: ReviewerState;
  manualReReviewPending: boolean;
}

export interface BoardPullRequest {
  id: string;
  bitbucketId: number;
  title: string;
  url: string | null;
  workspaceSlug: string;
  repositorySlug: string;
  sourceBranch: string;
  destBranch: string;
  authorId: string;
  authorName: string;
  state: PRHeadlineState;
  stale: boolean;
  ageMs: number;
  reviewers: BoardReviewer[];
  waitingOn: string[];
}

export interface PersonRef {
  userId: string;
  displayName: string;
}

export interface PersonLoad {
  userId: string;
  displayName: string;
  awaitingFirstReview: number;
  awaitingReReview: number;
  changesRequested: number;
  approved: number;
  awaitingTotal: number;
}

export interface Board {
  pullRequests: BoardPullRequest[];
  people: PersonLoad[];
  everyone: PersonRef[];
  counts: Record<PRHeadlineState, number>;
  staleDays: number;
  generatedAt: Date;
}

export interface PersonBoard {
  userId: string;
  displayName: string;
  toReview: BoardPullRequest[];
  authored: BoardPullRequest[];
  alreadyReviewed: BoardPullRequest[];
}

export interface ActivityEntry {
  id: string;
  eventType: EventType;
  createdAt: Date;
  actorId: string;
  actorName: string;
  pullRequestId: string;
  bitbucketId: number;
  prTitle: string;
  prUrl: string | null;
  repositorySlug: string;
  workspaceSlug: string;
  authorId: string;
  authorName: string;
  message: string;
}

export interface ActivityFeed {
  entries: ActivityEntry[];
  hasMore: boolean;
  limit: number;
}

export class DashboardService {
  async getBoard(now: Date = new Date()): Promise<Board> {
    const records = await prisma.pullRequest.findMany({
      where: { state: "OPEN" },
      include: {
        author: { select: { id: true, displayName: true } },
        reviewers: {
          include: { user: { select: { id: true, displayName: true } } },
        },
        events: {
          select: { eventType: true, actorId: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const staleDays = config.dashboard.staleDays;

    const pullRequests = records.map((record) =>
      this.buildPullRequest(record, now, staleDays)
    );

    pullRequests.sort((a, b) => {
      const byState = comparePRState(a.state, b.state);
      return byState !== 0 ? byState : b.ageMs - a.ageMs;
    });

    return {
      pullRequests,
      people: this.buildPeopleLoad(pullRequests),
      everyone: this.buildEveryone(pullRequests),
      counts: this.countByState(pullRequests),
      staleDays,
      generatedAt: now,
    };
  }

  async getPersonRef(userId: string): Promise<PersonRef | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true },
    });

    return user ? { userId: user.id, displayName: user.displayName } : null;
  }

  async getPersonBoard(
    userId: string,
    now: Date = new Date(),
    prebuiltBoard?: Board
  ): Promise<PersonBoard | null> {
    const user = await this.getPersonRef(userId);

    if (!user) return null;

    const board = prebuiltBoard ?? (await this.getBoard(now));

    const reviewerEntry = (pr: BoardPullRequest) =>
      pr.reviewers.find((reviewer) => reviewer.userId === userId);

    return {
      userId: user.userId,
      displayName: user.displayName,
      toReview: board.pullRequests.filter((pr) => {
        const entry = reviewerEntry(pr);
        return entry !== undefined && isAwaitingAction(entry.state);
      }),
      authored: board.pullRequests.filter((pr) => pr.authorId === userId),
      alreadyReviewed: board.pullRequests.filter((pr) => {
        const entry = reviewerEntry(pr);
        return entry !== undefined && !isAwaitingAction(entry.state);
      }),
    };
  }

  async getActivity(
    options: { limit?: number; personId?: string } = {}
  ): Promise<ActivityFeed> {
    const limit = options.limit ?? 10;

    const records = await prisma.pREvent.findMany({
      where: options.personId
        ? {
            OR: [
              { actorId: options.personId },
              { pullRequest: { authorId: options.personId } },
            ],
          }
        : undefined,
      include: {
        actor: { select: { id: true, displayName: true } },
        pullRequest: {
          select: {
            id: true,
            bitbucketId: true,
            title: true,
            url: true,
            repositorySlug: true,
            workspaceSlug: true,
            authorId: true,
            author: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = records.length > limit;

    const entries = records.slice(0, limit).map((record) => {
      const actorIsAuthor = record.actorId === record.pullRequest.authorId;
      return {
        id: record.id,
        eventType: record.eventType,
        createdAt: record.createdAt,
        actorId: record.actorId,
        actorName: record.actor.displayName,
        pullRequestId: record.pullRequest.id,
        bitbucketId: record.pullRequest.bitbucketId,
        prTitle: record.pullRequest.title,
        prUrl: record.pullRequest.url,
        repositorySlug: record.pullRequest.repositorySlug,
        workspaceSlug: record.pullRequest.workspaceSlug,
        authorId: record.pullRequest.authorId,
        authorName: record.pullRequest.author.displayName,
        message: describeActivity(
          record.eventType,
          record.actor.displayName,
          record.pullRequest.author.displayName,
          actorIsAuthor
        ),
      };
    });

    return { entries, hasMore, limit };
  }

  private buildPullRequest(
    record: {
      id: string;
      bitbucketId: number;
      title: string;
      url: string | null;
      workspaceSlug: string;
      repositorySlug: string;
      sourceBranch: string;
      destBranch: string;
      updatedAt: Date;
      author: { id: string; displayName: string };
      reviewers: { userId: string; status: ReviewerState | string; user: { id: string; displayName: string } }[];
      events: ReviewEvent[];
    },
    now: Date,
    staleDays: number
  ): BoardPullRequest {
    const reviewers: BoardReviewer[] = record.reviewers.map((reviewer) => {
      const state = deriveReviewerState(
        reviewer.status as "PENDING" | "APPROVED" | "CHANGES_REQUESTED",
        reviewer.user.id,
        record.events
      );

      return {
        userId: reviewer.user.id,
        displayName: reviewer.user.displayName,
        state,
        manualReReviewPending: reviewer.status === "PENDING" && state === "AWAITING_RE_REVIEW",
      };
    });

    const state = derivePRState(reviewers.map((reviewer) => reviewer.state));
    const lastActivityAt = this.lastActivityAt(record.events, record.updatedAt);

    return {
      id: record.id,
      bitbucketId: record.bitbucketId,
      title: record.title,
      url: record.url,
      workspaceSlug: record.workspaceSlug,
      repositorySlug: record.repositorySlug,
      sourceBranch: record.sourceBranch,
      destBranch: record.destBranch,
      authorId: record.author.id,
      authorName: record.author.displayName,
      state,
      stale:
        state !== "READY_TO_MERGE" && isStale(lastActivityAt, now, staleDays),
      ageMs: now.getTime() - lastActivityAt.getTime(),
      reviewers,
      waitingOn: this.waitingOn(state, reviewers, record.author.displayName),
    };
  }

  private lastActivityAt(events: ReviewEvent[], fallback: Date): Date {
    return events.reduce<Date>(
      (latest, event) => (event.createdAt > latest ? event.createdAt : latest),
      events.length > 0 ? events[0]!.createdAt : fallback
    );
  }

  private waitingOn(
    state: PRHeadlineState,
    reviewers: BoardReviewer[],
    authorName: string
  ): string[] {
    if (state === "BLOCKED" || state === "READY_TO_MERGE") return [authorName];
    if (state === "NO_REVIEWERS") return [];
    return reviewers
      .filter((reviewer) => isAwaitingAction(reviewer.state))
      .map((reviewer) => reviewer.displayName);
  }

  private buildEveryone(pullRequests: BoardPullRequest[]): PersonRef[] {
    const byUser = new Map<string, PersonRef>();

    for (const pr of pullRequests) {
      byUser.set(pr.authorId, { userId: pr.authorId, displayName: pr.authorName });
      for (const reviewer of pr.reviewers) {
        byUser.set(reviewer.userId, {
          userId: reviewer.userId,
          displayName: reviewer.displayName,
        });
      }
    }

    return [...byUser.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }

  private buildPeopleLoad(pullRequests: BoardPullRequest[]): PersonLoad[] {
    const byUser = new Map<string, PersonLoad>();

    for (const pr of pullRequests) {
      for (const reviewer of pr.reviewers) {
        const existing = byUser.get(reviewer.userId) ?? {
          userId: reviewer.userId,
          displayName: reviewer.displayName,
          awaitingFirstReview: 0,
          awaitingReReview: 0,
          changesRequested: 0,
          approved: 0,
          awaitingTotal: 0,
        };

        if (reviewer.state === "AWAITING_FIRST_REVIEW") existing.awaitingFirstReview += 1;
        if (reviewer.state === "AWAITING_RE_REVIEW") existing.awaitingReReview += 1;
        if (reviewer.state === "CHANGES_REQUESTED") existing.changesRequested += 1;
        if (reviewer.state === "APPROVED") existing.approved += 1;
        existing.awaitingTotal = existing.awaitingFirstReview + existing.awaitingReReview;

        byUser.set(reviewer.userId, existing);
      }
    }

    return [...byUser.values()].sort(
      (a, b) =>
        b.awaitingTotal - a.awaitingTotal ||
        a.displayName.localeCompare(b.displayName)
    );
  }

  private countByState(pullRequests: BoardPullRequest[]): Record<PRHeadlineState, number> {
    const counts: Record<PRHeadlineState, number> = {
      BLOCKED: 0,
      AWAITING_RE_REVIEW: 0,
      AWAITING_FIRST_REVIEW: 0,
      READY_TO_MERGE: 0,
      NO_REVIEWERS: 0,
    };

    for (const pr of pullRequests) counts[pr.state] += 1;

    return counts;
  }
}

export const dashboardService = new DashboardService();
