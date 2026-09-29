import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/env.js", () => ({
  config: {
    port: 3000,
    database: { url: "postgresql://test" },
    slack: { botToken: "x", signingSecret: "x", appToken: "x", adminUserId: "" },
    webhookSecret: "",
    dashboard: { staleDays: 3, hurryAfterHours: 24, hurryCooldownMinutes: 60 },
    bitbucket: { workspace: "", email: "", apiToken: "", repos: [] },
    aiReview: { repoPath: "/srv/shiplink", repositorySlug: "backend-api" },
  },
}));

import { prisma } from "../src/db/client.js";
import { DashboardService } from "../src/services/dashboard.service.js";

const NOW = new Date("2026-08-20T12:00:00Z");

const people = {
  john: { id: "u-john", displayName: "John Developer" },
  sarah: { id: "u-sarah", displayName: "Sarah Reviewer" },
  mike: { id: "u-mike", displayName: "Mike Tech Lead" },
  emma: { id: "u-emma", displayName: "Emma Senior Dev" },
};

function reviewer(
  user: { id: string; displayName: string },
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED"
) {
  return { userId: user.id, status, user };
}

function prRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "pr-1",
    bitbucketId: 482,
    title: "Add rate limiting to webhook ingest",
    url: "https://bitbucket.org/acme-corp/backend-api/pull-requests/482",
    workspaceSlug: "acme-corp",
    repositorySlug: "backend-api",
    sourceBranch: "feat/rate-limit",
    destBranch: "main",
    createdAt: new Date("2026-08-20T10:00:00Z"),
    updatedAt: new Date("2026-08-20T10:00:00Z"),
    author: people.john,
    reviewers: [reviewer(people.sarah, "PENDING")],
    events: [
      { eventType: "PR_CREATED", actorId: people.john.id, createdAt: new Date("2026-08-20T10:00:00Z") },
    ],
    aiReview: null,
    ...overrides,
  };
}

describe("DashboardService", () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
    vi.clearAllMocks();
  });

  describe("getBoard", () => {
    it("carries the AI review state and whether the feature is enabled for the PR's repo", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          aiReview: {
            status: "COMPLETED",
            error: null,
            finishedAt: new Date("2026-08-20T11:00:00Z"),
            requestedBy: { displayName: "John Developer" },
          },
        }),
        prRecord({ id: "pr-2", bitbucketId: 483 }),
        prRecord({ id: "pr-3", bitbucketId: 484, repositorySlug: "other-repo" }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests.find((pr) => pr.id === "pr-1")!.aiReview).toEqual({
        status: "COMPLETED",
        requestedByName: "John Developer",
        finishedAt: new Date("2026-08-20T11:00:00Z"),
        error: null,
      });
      expect(board.pullRequests.find((pr) => pr.id === "pr-2")!.aiReview).toBeNull();
      expect(board.pullRequests.find((pr) => pr.id === "pr-1")!.aiReviewEligible).toBe(true);
      expect(board.pullRequests.find((pr) => pr.id === "pr-3")!.aiReviewEligible).toBe(false);
    });

    it("derives reviewer and headline states from status and events", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          reviewers: [
            reviewer(people.sarah, "APPROVED"),
            reviewer(people.mike, "PENDING"),
            reviewer(people.emma, "PENDING"),
          ],
          events: [
            { eventType: "PR_APPROVED", actorId: people.mike.id, createdAt: new Date("2026-08-19T09:00:00Z") },
            { eventType: "PR_UPDATED", actorId: people.john.id, createdAt: new Date("2026-08-20T10:00:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);
      const pr = board.pullRequests[0]!;

      expect(pr.reviewers.map((r) => r.state)).toEqual([
        "APPROVED",
        "AWAITING_RE_REVIEW",
        "AWAITING_FIRST_REVIEW",
      ]);
      expect(pr.state).toBe("AWAITING_RE_REVIEW");
      expect(pr.waitingOn).toEqual(["Mike Tech Lead", "Emma Senior Dev"]);
    });

    it("flags manualReReviewPending only for a reset verdict, not a push-staled one", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          reviewers: [
            reviewer(people.sarah, "PENDING"),
            reviewer(people.mike, "CHANGES_REQUESTED"),
          ],
          events: [
            { eventType: "PR_APPROVED", actorId: people.sarah.id, createdAt: new Date("2026-08-18T09:00:00Z") },
            { eventType: "PR_CHANGES_REQUESTED", actorId: people.mike.id, createdAt: new Date("2026-08-18T09:00:00Z") },
            { eventType: "PR_COMMITS_PUSHED", actorId: people.john.id, createdAt: new Date("2026-08-19T09:00:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);
      const [sarah, mike] = board.pullRequests[0]!.reviewers;

      expect(sarah!.state).toBe("AWAITING_RE_REVIEW");
      expect(sarah!.manualReReviewPending).toBe(true);
      expect(mike!.state).toBe("AWAITING_RE_REVIEW");
      expect(mike!.manualReReviewPending).toBe(false);
    });

    it("points a blocked PR back at its author", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          reviewers: [reviewer(people.mike, "CHANGES_REQUESTED"), reviewer(people.emma, "APPROVED")],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests[0]!.state).toBe("BLOCKED");
      expect(board.pullRequests[0]!.waitingOn).toEqual(["John Developer"]);
    });

    it("marks a ready PR and never calls it stale", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          reviewers: [reviewer(people.sarah, "APPROVED"), reviewer(people.emma, "APPROVED")],
          events: [
            { eventType: "PR_APPROVED", actorId: people.emma.id, createdAt: new Date("2026-08-01T09:00:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests[0]!.state).toBe("READY_TO_MERGE");
      expect(board.pullRequests[0]!.stale).toBe(false);
    });

    it("marks a waiting PR stale once activity passes the threshold", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          createdAt: new Date("2026-08-14T12:00:00Z"),
          events: [
            { eventType: "PR_CREATED", actorId: people.john.id, createdAt: new Date("2026-08-14T12:00:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests[0]!.stale).toBe(true);
      expect(board.pullRequests[0]!.ageMs).toBe(6 * 86400000);
    });

    it("counts a first review as waiting since PR creation, not since another reviewer's approval", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          createdAt: new Date("2026-08-16T12:00:00Z"),
          reviewers: [
            reviewer(people.mike, "APPROVED"),
            reviewer(people.emma, "PENDING"),
          ],
          events: [
            { eventType: "PR_CREATED", actorId: people.john.id, createdAt: new Date("2026-08-16T12:00:00Z") },
            { eventType: "PR_APPROVED", actorId: people.mike.id, createdAt: new Date("2026-08-18T12:00:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);
      const pr = board.pullRequests[0]!;

      expect(pr.state).toBe("AWAITING_FIRST_REVIEW");
      expect(pr.ageMs).toBe(4 * 86400000);
    });

    it("sorts the most urgent state first and oldest first within a state", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          id: "pr-ready",
          bitbucketId: 491,
          reviewers: [reviewer(people.sarah, "APPROVED")],
        }),
        prRecord({
          id: "pr-waiting-new",
          bitbucketId: 486,
          createdAt: new Date("2026-08-20T08:00:00Z"),
          events: [{ eventType: "PR_CREATED", actorId: people.john.id, createdAt: new Date("2026-08-20T08:00:00Z") }],
        }),
        prRecord({
          id: "pr-blocked",
          bitbucketId: 479,
          reviewers: [reviewer(people.mike, "CHANGES_REQUESTED")],
        }),
        prRecord({
          id: "pr-waiting-old",
          bitbucketId: 468,
          createdAt: new Date("2026-08-14T10:00:00Z"),
          events: [{ eventType: "PR_CREATED", actorId: people.john.id, createdAt: new Date("2026-08-14T10:00:00Z") }],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests.map((pr) => pr.id)).toEqual([
        "pr-blocked",
        "pr-waiting-old",
        "pr-waiting-new",
        "pr-ready",
      ]);
    });

    it("counts pull requests by headline state", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({ id: "a", reviewers: [reviewer(people.mike, "CHANGES_REQUESTED")] }),
        prRecord({ id: "b", reviewers: [reviewer(people.sarah, "APPROVED")] }),
        prRecord({ id: "c", reviewers: [] }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.counts).toEqual({
        BLOCKED: 1,
        AWAITING_RE_REVIEW: 0,
        AWAITING_FIRST_REVIEW: 0,
        READY_TO_MERGE: 1,
        NO_REVIEWERS: 1,
      });
    });

    it("aggregates per-person load across pull requests", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({ id: "a", reviewers: [reviewer(people.emma, "PENDING"), reviewer(people.sarah, "APPROVED")] }),
        prRecord({ id: "b", reviewers: [reviewer(people.emma, "PENDING")] }),
      ] as never);

      const board = await service.getBoard(NOW);
      const emma = board.people.find((person) => person.userId === people.emma.id)!;
      const sarah = board.people.find((person) => person.userId === people.sarah.id)!;

      expect(emma.awaitingFirstReview).toBe(2);
      expect(emma.awaitingTotal).toBe(2);
      expect(sarah.approved).toBe(1);
      expect(sarah.awaitingTotal).toBe(0);
      expect(board.people[0]!.userId).toBe(people.emma.id);
    });

    it("lists authors in the picker even when they review nothing", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({ id: "a", author: people.john, reviewers: [reviewer(people.emma, "PENDING")] }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.everyone.map((person) => person.userId).sort()).toEqual([
        people.emma.id,
        people.john.id,
      ]);
      expect(board.people.map((person) => person.userId)).toEqual([people.emma.id]);
    });

    it("lists each person once and sorts the picker by name", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({ id: "a", author: people.sarah, reviewers: [reviewer(people.mike, "PENDING")] }),
        prRecord({ id: "b", author: people.mike, reviewers: [reviewer(people.sarah, "APPROVED")] }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.everyone.map((person) => person.displayName)).toEqual([
        "Mike Tech Lead",
        "Sarah Reviewer",
      ]);
    });

    it("counts hurries only since the PR became blocked and makes it hurryable after the wait", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          createdAt: new Date("2026-08-15T10:00:00Z"),
          reviewers: [reviewer(people.sarah, "CHANGES_REQUESTED")],
          events: [
            { eventType: "PR_CHANGES_REQUESTED", actorId: people.sarah.id, createdAt: new Date("2026-08-16T10:00:00Z") },
            { eventType: "PR_HURRIED", actorId: people.mike.id, createdAt: new Date("2026-08-16T08:00:00Z") },
            { eventType: "PR_HURRIED", actorId: people.sarah.id, createdAt: new Date("2026-08-18T09:00:00Z") },
            { eventType: "PR_HURRIED", actorId: people.mike.id, createdAt: new Date("2026-08-20T11:30:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests[0]!.hurry).toEqual({
        count: 2,
        eligible: true,
        target: "AUTHOR",
        targetIds: [people.john.id],
        coolingDownUserIds: [people.mike.id],
      });
    });

    it("targets the reviewers who still owe a review once the PR has waited long enough", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          createdAt: new Date("2026-08-17T10:00:00Z"),
          reviewers: [
            reviewer(people.sarah, "PENDING"),
            reviewer(people.mike, "APPROVED"),
            reviewer(people.emma, "PENDING"),
          ],
          events: [
            { eventType: "PR_APPROVED", actorId: people.mike.id, createdAt: new Date("2026-08-18T10:00:00Z") },
            { eventType: "PR_REVIEWERS_HURRIED", actorId: people.john.id, createdAt: new Date("2026-08-20T11:30:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests[0]!.hurry).toEqual({
        count: 1,
        eligible: true,
        target: "REVIEWERS",
        targetIds: [people.sarah.id, people.emma.id],
        coolingDownUserIds: [people.john.id],
      });
    });

    it("never offers a hurry on a PR that is ready to merge", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          createdAt: new Date("2026-08-01T10:00:00Z"),
          reviewers: [reviewer(people.sarah, "APPROVED")],
          events: [
            { eventType: "PR_APPROVED", actorId: people.sarah.id, createdAt: new Date("2026-08-02T10:00:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests[0]!.hurry).toEqual({
        count: 0,
        eligible: false,
        target: null,
        targetIds: [],
        coolingDownUserIds: [],
      });
    });

    it("is not hurryable before the wait passes and drops old hurries once the state changes", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          reviewers: [reviewer(people.sarah, "CHANGES_REQUESTED")],
          events: [
            { eventType: "PR_CHANGES_REQUESTED", actorId: people.sarah.id, createdAt: new Date("2026-08-20T01:00:00Z") },
          ],
        }),
        prRecord({
          id: "pr-2",
          bitbucketId: 483,
          reviewers: [reviewer(people.sarah, "CHANGES_REQUESTED")],
          events: [
            { eventType: "PR_CHANGES_REQUESTED", actorId: people.sarah.id, createdAt: new Date("2026-08-10T10:00:00Z") },
            { eventType: "PR_HURRIED", actorId: people.mike.id, createdAt: new Date("2026-08-15T10:00:00Z") },
            { eventType: "PR_COMMITS_PUSHED", actorId: people.john.id, createdAt: new Date("2026-08-16T10:00:00Z") },
          ],
        }),
      ] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests.find((pr) => pr.id === "pr-1")!.hurry.eligible).toBe(false);
      expect(board.pullRequests.find((pr) => pr.id === "pr-2")!.hurry.count).toBe(0);
    });

    it("returns an empty board when nothing is open", async () => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([] as never);

      const board = await service.getBoard(NOW);

      expect(board.pullRequests).toEqual([]);
      expect(board.people).toEqual([]);
      expect(board.everyone).toEqual([]);
      expect(board.counts.BLOCKED).toBe(0);
    });
  });

  describe("getPersonBoard", () => {
    beforeEach(() => {
      vi.mocked(prisma.pullRequest.findMany).mockResolvedValue([
        prRecord({
          id: "needs-emma",
          reviewers: [reviewer(people.emma, "PENDING")],
        }),
        prRecord({
          id: "emma-reviewed",
          reviewers: [reviewer(people.emma, "APPROVED")],
        }),
        prRecord({
          id: "emma-authored",
          author: people.emma,
          reviewers: [reviewer(people.sarah, "PENDING")],
        }),
      ] as never);
    });

    it("splits a person's board into waiting, authored and reviewed", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(people.emma as never);

      const person = await service.getPersonBoard(people.emma.id, NOW);

      expect(person!.displayName).toBe("Emma Senior Dev");
      expect(person!.toReview.map((pr) => pr.id)).toEqual(["needs-emma"]);
      expect(person!.alreadyReviewed.map((pr) => pr.id)).toEqual(["emma-reviewed"]);
      expect(person!.authored.map((pr) => pr.id)).toEqual(["emma-authored"]);
    });

    it("returns null for an unknown person", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      expect(await service.getPersonBoard("nobody", NOW)).toBeNull();
    });
  });

  describe("getPullRequest", () => {
    it("builds a single open pull request", async () => {
      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue({ ...prRecord(), state: "OPEN" } as never);

      const pr = await service.getPullRequest("pr-1", NOW);

      expect(pr!.id).toBe("pr-1");
      expect(pr!.state).toBe("AWAITING_FIRST_REVIEW");
    });

    it("returns null for a closed or missing pull request", async () => {
      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValueOnce({ ...prRecord(), state: "MERGED" } as never);
      expect(await service.getPullRequest("pr-1", NOW)).toBeNull();

      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValueOnce(null);
      expect(await service.getPullRequest("pr-1", NOW)).toBeNull();
    });
  });

  describe("getPersonRef", () => {
    it("returns the person's ref", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(people.emma as never);

      expect(await service.getPersonRef(people.emma.id)).toEqual({
        userId: people.emma.id,
        displayName: people.emma.displayName,
      });
    });

    it("returns null for an unknown person", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      expect(await service.getPersonRef("nobody")).toBeNull();
    });
  });

  describe("getActivity", () => {
    function eventRecord(overrides: Record<string, unknown> = {}) {
      return {
        id: "ev-1",
        eventType: "PR_APPROVED",
        createdAt: new Date("2026-08-20T11:00:00Z"),
        actorId: people.sarah.id,
        actor: people.sarah,
        pullRequest: {
          id: "pr-1",
          bitbucketId: 482,
          title: "Add rate limiting to webhook ingest",
          url: "https://bitbucket.org/acme-corp/backend-api/pull-requests/482",
          repositorySlug: "backend-api",
          workspaceSlug: "acme-corp",
          authorId: people.john.id,
          author: people.john,
        },
        ...overrides,
      };
    }

    it("builds a human-readable message per event", async () => {
      vi.mocked(prisma.pREvent.findMany).mockResolvedValue([eventRecord()] as never);

      const activity = await service.getActivity();

      expect(activity.entries[0]!.message).toBe(
        "Sarah Reviewer approved John Developer's PR"
      );
      expect(activity.hasMore).toBe(false);
      expect(activity.limit).toBe(10);
    });

    it("marks hasMore when more rows exist than the limit", async () => {
      vi.mocked(prisma.pREvent.findMany).mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => eventRecord({ id: `ev-${i}` })) as never
      );

      const activity = await service.getActivity({ limit: 2 });

      expect(activity.entries).toHaveLength(2);
      expect(activity.hasMore).toBe(true);
    });

    it("filters by person across both authored PRs and their own actions", async () => {
      vi.mocked(prisma.pREvent.findMany).mockResolvedValue([eventRecord()] as never);

      await service.getActivity({ personId: people.john.id });

      expect(prisma.pREvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { actorId: people.john.id },
              { pullRequest: { authorId: people.john.id } },
            ],
          },
        })
      );
    });
  });
});
