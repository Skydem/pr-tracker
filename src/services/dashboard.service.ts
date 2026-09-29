import type { AiReviewStatus, EventType, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { config } from "../config/env.js";
import { aiReviewService } from "./ai-review.service.js";
import {
  deriveReviewerState,
  deriveReviewerStateSince,
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

export interface BoardAiReview {
  status: AiReviewStatus;
  requestedByName: string;
  finishedAt: Date | null;
  error: string | null;
}

export type HurryTarget = "AUTHOR" | "REVIEWERS";

export interface BoardHurry {
  count: number;
  eligible: boolean;
  target: HurryTarget | null;
  targetIds: string[];
  coolingDownUserIds: string[];
}

const HURRY_EVENT_TYPES: EventType[] = ["PR_HURRIED", "PR_REVIEWERS_HURRIED"];

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
  aiReview: BoardAiReview | null;
  aiReviewEligible: boolean;
  hurry: BoardHurry;
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

const BOARD_PR_INCLUDE = {
  author: { select: { id: true, displayName: true } },
  reviewers: {
    include: { user: { select: { id: true, displayName: true } } },
  },
  events: {
    select: { eventType: true, actorId: true, createdAt: true },
  },
  aiReview: {
    select: {
      status: true,
      error: true,
      finishedAt: true,
      requestedBy: { select: { displayName: true } },
    },
  },
} satisfies Prisma.PullRequestInclude;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export class DashboardService {
  async getBoard(now: Date = new Date()): Promise<Board> {
    const records = await prisma.pullRequest.findMany({
      where: { state: "OPEN" },
      include: BOARD_PR_INCLUDE,
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

  async getPullRequest(pullRequestId: string, now: Date = new Date()): Promise<BoardPullRequest | null> {
    const record = await prisma.pullRequest.findUnique({
      where: { id: pullRequestId },
      include: BOARD_PR_INCLUDE,
    });

    if (!record || record.state !== "OPEN") return null;

    return this.buildPullRequest(record, now, config.dashboard.staleDays);
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
      createdAt: Date;
      updatedAt: Date;
      author: { id: string; displayName: string };
      reviewers: { userId: string; status: ReviewerState | string; user: { id: string; displayName: string } }[];
      events: ReviewEvent[];
      aiReview: {
        status: AiReviewStatus;
        error: string | null;
        finishedAt: Date | null;
        requestedBy: { displayName: string };
      } | null;
    },
    now: Date,
    staleDays: number
  ): BoardPullRequest {
    const reviewersWithSince = record.reviewers.map((reviewer) => {
      const status = reviewer.status as "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
      const state = deriveReviewerState(status, reviewer.user.id, record.events);
      const since = deriveReviewerStateSince(
        record.createdAt,
        status,
        reviewer.user.id,
        record.events
      );

      return {
        userId: reviewer.user.id,
        displayName: reviewer.user.displayName,
        state,
        since,
        manualReReviewPending: reviewer.status === "PENDING" && state === "AWAITING_RE_REVIEW",
      };
    });

    const reviewers: BoardReviewer[] = reviewersWithSince.map(
      ({ since: _since, ...reviewer }) => reviewer
    );

    const state = derivePRState(reviewers.map((reviewer) => reviewer.state));
    const stateSince = this.stateSince(state, reviewersWithSince, record.createdAt);

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
        state !== "READY_TO_MERGE" && isStale(stateSince, now, staleDays),
      ageMs: now.getTime() - stateSince.getTime(),
      reviewers,
      waitingOn: this.waitingOn(state, reviewers, record.author.displayName),
      aiReview: record.aiReview
        ? {
            status: record.aiReview.status,
            requestedByName: record.aiReview.requestedBy.displayName,
            finishedAt: record.aiReview.finishedAt,
            error: record.aiReview.error,
          }
        : null,
      aiReviewEligible: aiReviewService.isEnabledFor(record.repositorySlug),
      hurry: this.hurry(state, stateSince, record.author.id, reviewers, record.events, now),
    };
  }

  private hurry(
    state: PRHeadlineState,
    stateSince: Date,
    authorId: string,
    reviewers: BoardReviewer[],
    events: ReviewEvent[],
    now: Date
  ): BoardHurry {
    const target = this.hurryTarget(state);
    if (target === null) {
      return { count: 0, eligible: false, target: null, targetIds: [], coolingDownUserIds: [] };
    }

    const hurries = events.filter(
      (event) => HURRY_EVENT_TYPES.includes(event.eventType) && event.createdAt >= stateSince
    );
    const cooldownStart = now.getTime() - config.dashboard.hurryCooldownMinutes * MINUTE_MS;

    return {
      count: hurries.length,
      eligible: now.getTime() - stateSince.getTime() >= config.dashboard.hurryAfterHours * HOUR_MS,
      target,
      targetIds:
        target === "AUTHOR"
          ? [authorId]
          : reviewers.filter((reviewer) => isAwaitingAction(reviewer.state)).map((reviewer) => reviewer.userId),
      coolingDownUserIds: [
        ...new Set(
          hurries
            .filter((event) => event.createdAt.getTime() > cooldownStart)
            .map((event) => event.actorId)
        ),
      ],
    };
  }

  private hurryTarget(state: PRHeadlineState): HurryTarget | null {
    if (state === "BLOCKED") return "AUTHOR";
    if (state === "AWAITING_FIRST_REVIEW" || state === "AWAITING_RE_REVIEW") return "REVIEWERS";
    return null;
  }

  /**
   * When the PR's headline state actually began, driven by whichever
   * reviewer(s) put it in that state — not by unrelated activity from a
   * reviewer who isn't the reason the PR is in this state. When several
   * reviewers share the driving state, use the earliest of them: that's
   * the longest anyone has genuinely been waiting.
   */
  private stateSince(
    state: PRHeadlineState,
    reviewers: { state: ReviewerState; since: Date }[],
    prCreatedAt: Date
  ): Date {
    const drivingState: ReviewerState | null =
      state === "BLOCKED"
        ? "CHANGES_REQUESTED"
        : state === "AWAITING_RE_REVIEW"
          ? "AWAITING_RE_REVIEW"
          : state === "AWAITING_FIRST_REVIEW"
            ? "AWAITING_FIRST_REVIEW"
            : null;

    if (drivingState === null) {
      if (state === "READY_TO_MERGE") {
        return reviewers.reduce<Date>(
          (latest, reviewer) => (reviewer.since > latest ? reviewer.since : latest),
          prCreatedAt
        );
      }
      return prCreatedAt;
    }

    const driving = reviewers.filter((reviewer) => reviewer.state === drivingState);
    if (driving.length === 0) return prCreatedAt;

    return driving.reduce<Date>(
      (earliest, reviewer) => (reviewer.since < earliest ? reviewer.since : earliest),
      driving[0]!.since
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
