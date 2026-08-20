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

export interface BoardReviewer {
  userId: string;
  displayName: string;
  state: ReviewerState;
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

  async getPersonBoard(
    userId: string,
    now: Date = new Date(),
    prebuiltBoard?: Board
  ): Promise<PersonBoard | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true },
    });

    if (!user) return null;

    const board = prebuiltBoard ?? (await this.getBoard(now));

    const reviewerEntry = (pr: BoardPullRequest) =>
      pr.reviewers.find((reviewer) => reviewer.userId === userId);

    return {
      userId: user.id,
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
    const reviewers: BoardReviewer[] = record.reviewers.map((reviewer) => ({
      userId: reviewer.user.id,
      displayName: reviewer.user.displayName,
      state: deriveReviewerState(
        reviewer.status as "PENDING" | "APPROVED" | "CHANGES_REQUESTED",
        reviewer.user.id,
        record.events
      ),
    }));

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
