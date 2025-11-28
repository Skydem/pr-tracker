/**
 * Functional tests for the complete PR lifecycle.
 * Tests the flow: create -> update -> review -> approve -> merge
 *
 * These tests simulate real-world Bitbucket webhook sequences.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import { createBitbucketWebhookRouter } from "../../src/webhooks/bitbucket.handler.js";
import {
  scenarioFeaturePR,
  scenarioHotfixPR,
  scenarioDeclinedPR,
  testUsers,
  mockDbUsers,
  mockDbPRs,
  mockDbReviewers,
  createPRWithReviewers,
} from "../fixtures/bitbucket-payloads.js";

// =============================================================================
// Mock Setup
// =============================================================================

vi.mock("../../src/config/env.js", () => ({
  config: {
    webhookSecret: "",
    slack: { adminUserId: "" },
  },
}));

// Track all calls for verification
const mockCalls = {
  usersCreated: [] as Array<{ uuid: string; displayName: string }>,
  prsCreated: [] as Array<{ bitbucketId: number; title: string }>,
  eventsLogged: [] as Array<{ eventType: string; actorUuid: string }>,
  reviewerStatusUpdates: [] as Array<{ pullRequestId: string; status: string }>,
  prStateUpdates: [] as Array<{ pullRequestId: string; state: string }>,
  notificationsSent: [] as string[],
};

vi.mock("../../src/services/user.service.js", () => ({
  userService: {
    findOrCreateUser: vi.fn().mockImplementation((uuid, email, displayName) => {
      mockCalls.usersCreated.push({ uuid, displayName });
      // Return appropriate mock user based on UUID
      const user = Object.values(mockDbUsers).find((u) => u.bitbucketUuid === uuid);
      return Promise.resolve(
        user ?? {
          id: `user-${uuid}`,
          bitbucketUuid: uuid,
          bitbucketEmail: email,
          slackUserId: null,
          displayName,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    }),
    getUserByBitbucketUuid: vi.fn().mockImplementation((uuid) => {
      const user = Object.values(mockDbUsers).find((u) => u.bitbucketUuid === uuid);
      return Promise.resolve(user ?? null);
    }),
  },
}));

// Create a mock PR state tracker for the test
let mockPRState: {
  pr: typeof mockDbPRs.openPR | null;
  reviewerStatuses: Map<string, string>;
};

vi.mock("../../src/services/pr.service.js", () => ({
  prService: {
    createOrUpdatePR: vi.fn().mockImplementation((prData, workspaceSlug) => {
      mockCalls.prsCreated.push({ bitbucketId: prData.id, title: prData.title });

      mockPRState.pr = {
        ...mockDbPRs.openPR,
        bitbucketId: prData.id,
        title: prData.title,
        sourceBranch: prData.source.branch.name,
        destBranch: prData.destination.branch.name,
        workspaceSlug,
        state: prData.state === "MERGED" ? "MERGED" : prData.state === "DECLINED" ? "DECLINED" : "OPEN",
      };

      // Initialize reviewers
      prData.reviewers.forEach((r: { uuid: string }) => {
        if (!mockPRState.reviewerStatuses.has(r.uuid)) {
          mockPRState.reviewerStatuses.set(r.uuid, "PENDING");
        }
      });

      return Promise.resolve(
        createPRWithReviewers(
          mockPRState.pr,
          mockDbUsers.author,
          prData.reviewers.map((r: { uuid: string; display_name: string }) => ({
            reviewer: {
              id: `reviewer-${r.uuid}`,
              pullRequestId: mockPRState.pr!.id,
              userId: `user-${r.uuid}`,
              status: (mockPRState.reviewerStatuses.get(r.uuid) ?? "PENDING") as "PENDING" | "APPROVED" | "CHANGES_REQUESTED",
              updatedAt: new Date(),
            },
            user: {
              id: `user-${r.uuid}`,
              bitbucketUuid: r.uuid,
              bitbucketEmail: null,
              slackUserId: Object.values(mockDbUsers).find((u) => u.bitbucketUuid === r.uuid)?.slackUserId ?? null,
              displayName: r.display_name,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }))
        )
      );
    }),
    getPRByBitbucketId: vi.fn().mockImplementation((bitbucketId, repoSlug, wsSlug) => {
      if (!mockPRState.pr || mockPRState.pr.bitbucketId !== bitbucketId) {
        return Promise.resolve(null);
      }
      return Promise.resolve(
        createPRWithReviewers(mockPRState.pr, mockDbUsers.author, [])
      );
    }),
    getPRWithReviewers: vi.fn().mockImplementation((prId) => {
      if (!mockPRState.pr) return Promise.resolve(null);

      const reviewers = Array.from(mockPRState.reviewerStatuses.entries()).map(
        ([uuid, status]) => {
          const user = Object.values(mockDbUsers).find((u) => u.bitbucketUuid === uuid);
          return {
            reviewer: {
              id: `reviewer-${uuid}`,
              pullRequestId: prId,
              userId: user?.id ?? `user-${uuid}`,
              status: status as "PENDING" | "APPROVED" | "CHANGES_REQUESTED",
              updatedAt: new Date(),
            },
            user: user ?? {
              id: `user-${uuid}`,
              bitbucketUuid: uuid,
              bitbucketEmail: null,
              slackUserId: null,
              displayName: "Unknown",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          };
        }
      );

      return Promise.resolve(createPRWithReviewers(mockPRState.pr, mockDbUsers.author, reviewers));
    }),
    updateReviewerStatus: vi.fn().mockImplementation((prId, bitbucketUuid, status) => {
      mockCalls.reviewerStatusUpdates.push({ pullRequestId: prId, status });
      mockPRState.reviewerStatuses.set(bitbucketUuid, status);
      return Promise.resolve();
    }),
    updatePRState: vi.fn().mockImplementation((prId, state) => {
      mockCalls.prStateUpdates.push({ pullRequestId: prId, state });
      if (mockPRState.pr) {
        mockPRState.pr.state = state;
      }
      return Promise.resolve();
    }),
    logEvent: vi.fn().mockImplementation((prId, eventType, actorUuid, payload) => {
      mockCalls.eventsLogged.push({ eventType, actorUuid });
      return Promise.resolve();
    }),
    areAllReviewersApproved: vi.fn().mockImplementation((prId) => {
      if (mockPRState.reviewerStatuses.size === 0) return Promise.resolve(false);
      const allApproved = Array.from(mockPRState.reviewerStatuses.values()).every(
        (status) => status === "APPROVED"
      );
      return Promise.resolve(allApproved);
    }),
    getReviewersWithStatus: vi.fn().mockImplementation((prId, status) => {
      const result: Array<{ userId: string; slackUserId: string | null }> = [];
      mockPRState.reviewerStatuses.forEach((s, uuid) => {
        if (s === status) {
          const user = Object.values(mockDbUsers).find((u) => u.bitbucketUuid === uuid);
          result.push({
            userId: user?.id ?? `user-${uuid}`,
            slackUserId: user?.slackUserId ?? null,
          });
        }
      });
      return Promise.resolve(result);
    }),
  },
}));

vi.mock("../../src/services/notification.service.js", () => ({
  notificationService: {
    notifyReviewersOnPRCreated: vi.fn().mockImplementation(() => {
      mockCalls.notificationsSent.push("PR_CREATED_REVIEWERS");
      return Promise.resolve();
    }),
    notifyReviewersOnPRUpdated: vi.fn().mockImplementation(() => {
      mockCalls.notificationsSent.push("PR_UPDATED_REVIEWERS");
      return Promise.resolve();
    }),
    notifyAuthorOnChangesRequested: vi.fn().mockImplementation(() => {
      mockCalls.notificationsSent.push("CHANGES_REQUESTED_AUTHOR");
      return Promise.resolve();
    }),
    notifyAuthorOnAllApproved: vi.fn().mockImplementation(() => {
      mockCalls.notificationsSent.push("ALL_APPROVED_AUTHOR");
      return Promise.resolve();
    }),
    notifyAuthorOnComment: vi.fn().mockImplementation(() => {
      mockCalls.notificationsSent.push("COMMENT_AUTHOR");
      return Promise.resolve();
    }),
  },
}));

import { prService } from "../../src/services/pr.service.js";
import { userService } from "../../src/services/user.service.js";
import { notificationService } from "../../src/services/notification.service.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createMockRequest(eventType: string, payload: object): Request {
  return {
    headers: {
      "x-event-key": eventType,
    },
    body: payload,
  } as unknown as Request;
}

function createMockResponse(): Response & {
  statusCode: number;
  responseJson: unknown;
} {
  const res = {
    statusCode: 0,
    responseJson: null as unknown,
    status: vi.fn().mockImplementation(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn().mockImplementation(function (this: typeof res, data: unknown) {
      this.responseJson = data;
      return this;
    }),
  };
  return res as unknown as Response & { statusCode: number; responseJson: unknown };
}

async function sendWebhook(
  router: ReturnType<typeof createBitbucketWebhookRouter>,
  eventType: string,
  payload: object
) {
  const req = createMockRequest(eventType, payload);
  const res = createMockResponse();

  const handlers = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
        };
      }>;
    }
  ).stack;

  const postHandler = handlers.find((layer) => layer.route?.path === "/");

  if (postHandler?.route?.stack[0]) {
    await postHandler.route.stack[0].handle(req, res);
  }

  return res;
}

// =============================================================================
// Tests
// =============================================================================

describe("PR Lifecycle - Complete Flow", () => {
  let router: ReturnType<typeof createBitbucketWebhookRouter>;

  beforeEach(() => {
    router = createBitbucketWebhookRouter();
    vi.clearAllMocks();

    // Reset tracking
    mockCalls.usersCreated = [];
    mockCalls.prsCreated = [];
    mockCalls.eventsLogged = [];
    mockCalls.reviewerStatusUpdates = [];
    mockCalls.prStateUpdates = [];
    mockCalls.notificationsSent = [];

    // Reset mock PR state
    mockPRState = {
      pr: null,
      reviewerStatuses: new Map(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Feature PR: Create -> Changes Requested -> Update -> Approve -> Merge", () => {
    it("should handle complete feature PR workflow", async () => {
      // Step 1: PR Created with 3 reviewers
      const createRes = await sendWebhook(
        router,
        "pullrequest:created",
        scenarioFeaturePR.created()
      );

      expect(createRes.statusCode).toBe(200);
      expect(prService.createOrUpdatePR).toHaveBeenCalledTimes(1);
      expect(prService.logEvent).toHaveBeenCalledWith(
        expect.any(String),
        "PR_CREATED",
        testUsers.author.uuid,
        expect.any(Object)
      );
      expect(notificationService.notifyReviewersOnPRCreated).toHaveBeenCalledTimes(1);

      // Verify actor was registered via findOrCreateUser
      // Note: Reviewer creation happens inside createOrUpdatePR (mocked)
      expect(mockCalls.usersCreated).toHaveLength(1);
      expect(mockCalls.usersCreated[0].uuid).toBe(testUsers.author.uuid);

      // Step 2: Reviewer 1 approves
      const approve1Res = await sendWebhook(
        router,
        "pullrequest:approved",
        scenarioFeaturePR.reviewer1Approved()
      );

      expect(approve1Res.statusCode).toBe(200);
      expect(prService.updateReviewerStatus).toHaveBeenCalledWith(
        expect.any(String),
        testUsers.reviewer1.uuid,
        "APPROVED"
      );
      expect(prService.logEvent).toHaveBeenCalledWith(
        expect.any(String),
        "PR_APPROVED",
        testUsers.reviewer1.uuid,
        expect.any(Object)
      );
      // notifyAuthorOnAllApproved is called, but internally checks areAllReviewersApproved
      // The mock for areAllReviewersApproved returns false since not all reviewers approved
      expect(notificationService.notifyAuthorOnAllApproved).toHaveBeenCalled();

      // Step 3: Reviewer 2 requests changes
      const changesRes = await sendWebhook(
        router,
        "pullrequest:changes_request_created",
        scenarioFeaturePR.reviewer2ChangesRequested()
      );

      expect(changesRes.statusCode).toBe(200);
      expect(prService.updateReviewerStatus).toHaveBeenCalledWith(
        expect.any(String),
        testUsers.reviewer2.uuid,
        "CHANGES_REQUESTED"
      );
      expect(notificationService.notifyAuthorOnChangesRequested).toHaveBeenCalled();

      // Step 4: Author updates PR
      const updateRes = await sendWebhook(
        router,
        "pullrequest:updated",
        scenarioFeaturePR.authorUpdated()
      );

      expect(updateRes.statusCode).toBe(200);
      expect(prService.logEvent).toHaveBeenCalledWith(
        expect.any(String),
        "PR_UPDATED",
        testUsers.author.uuid
      );
      expect(notificationService.notifyReviewersOnPRUpdated).toHaveBeenCalled();

      // Step 5: Reviewer 2 approves after changes
      const approve2Res = await sendWebhook(
        router,
        "pullrequest:approved",
        scenarioFeaturePR.reviewer2Approved()
      );

      expect(approve2Res.statusCode).toBe(200);
      expect(prService.updateReviewerStatus).toHaveBeenCalledWith(
        expect.any(String),
        testUsers.reviewer2.uuid,
        "APPROVED"
      );

      // Step 6: Reviewer 3 approves - all approved!
      const approve3Res = await sendWebhook(
        router,
        "pullrequest:approved",
        scenarioFeaturePR.reviewer3Approved()
      );

      expect(approve3Res.statusCode).toBe(200);
      expect(notificationService.notifyAuthorOnAllApproved).toHaveBeenCalled();

      // Step 7: PR merged
      const mergeRes = await sendWebhook(
        router,
        "pullrequest:fulfilled",
        scenarioFeaturePR.merged()
      );

      expect(mergeRes.statusCode).toBe(200);
      expect(prService.updatePRState).toHaveBeenCalledWith(expect.any(String), "MERGED");
      expect(prService.logEvent).toHaveBeenCalledWith(
        expect.any(String),
        "PR_MERGED",
        testUsers.author.uuid
      );

      // Verify complete event sequence
      const eventTypes = mockCalls.eventsLogged.map((e) => e.eventType);
      expect(eventTypes).toContain("PR_CREATED");
      expect(eventTypes).toContain("PR_APPROVED");
      expect(eventTypes).toContain("PR_CHANGES_REQUESTED");
      expect(eventTypes).toContain("PR_UPDATED");
      expect(eventTypes).toContain("PR_MERGED");
    });
  });

  describe("Hotfix PR: Create -> Approve -> Merge (fast track)", () => {
    it("should handle expedited hotfix workflow with single reviewer", async () => {
      // Reset state
      mockPRState = { pr: null, reviewerStatuses: new Map() };

      // Step 1: Hotfix PR created
      const createRes = await sendWebhook(
        router,
        "pullrequest:created",
        scenarioHotfixPR.created()
      );

      expect(createRes.statusCode).toBe(200);
      expect(mockCalls.prsCreated).toHaveLength(1);
      expect(mockCalls.prsCreated[0].title).toBe("Fix critical security vulnerability");

      // Verify only 1 reviewer (tech lead) was added
      const prCreatedCall = vi.mocked(prService.createOrUpdatePR).mock.calls[0];
      expect(prCreatedCall[0].reviewers).toHaveLength(1);
      expect(prCreatedCall[0].reviewers[0].uuid).toBe(testUsers.reviewer2.uuid);

      // Step 2: Tech lead approves
      const approveRes = await sendWebhook(
        router,
        "pullrequest:approved",
        scenarioHotfixPR.approved()
      );

      expect(approveRes.statusCode).toBe(200);
      expect(prService.updateReviewerStatus).toHaveBeenCalledWith(
        expect.any(String),
        testUsers.reviewer2.uuid,
        "APPROVED"
      );

      // Step 3: Immediately merged
      const mergeRes = await sendWebhook(
        router,
        "pullrequest:fulfilled",
        scenarioHotfixPR.merged()
      );

      expect(mergeRes.statusCode).toBe(200);
      expect(prService.updatePRState).toHaveBeenCalledWith(expect.any(String), "MERGED");
    });
  });

  describe("Declined PR: Create -> Comments -> Decline", () => {
    it("should handle PR that gets declined after discussion", async () => {
      // Reset state
      mockPRState = { pr: null, reviewerStatuses: new Map() };

      // Step 1: PR created
      const createRes = await sendWebhook(
        router,
        "pullrequest:created",
        scenarioDeclinedPR.created()
      );

      expect(createRes.statusCode).toBe(200);

      // Step 2: Reviewer comments with concerns
      const comment1Res = await sendWebhook(
        router,
        "pullrequest:comment_created",
        scenarioDeclinedPR.comment1()
      );

      expect(comment1Res.statusCode).toBe(200);
      expect(prService.logEvent).toHaveBeenCalledWith(
        expect.any(String),
        "PR_COMMENT_ADDED",
        testUsers.reviewer1.uuid,
        expect.any(Object)
      );
      expect(notificationService.notifyAuthorOnComment).toHaveBeenCalled();

      // Step 3: Author responds
      const comment2Res = await sendWebhook(
        router,
        "pullrequest:comment_created",
        scenarioDeclinedPR.comment2()
      );

      expect(comment2Res.statusCode).toBe(200);

      // Step 4: PR declined
      const declineRes = await sendWebhook(
        router,
        "pullrequest:rejected",
        scenarioDeclinedPR.declined()
      );

      expect(declineRes.statusCode).toBe(200);
      expect(prService.updatePRState).toHaveBeenCalledWith(expect.any(String), "DECLINED");
      expect(prService.logEvent).toHaveBeenCalledWith(
        expect.any(String),
        "PR_DECLINED",
        testUsers.author.uuid
      );
    });
  });
});

describe("PR Lifecycle - Edge Cases", () => {
  let router: ReturnType<typeof createBitbucketWebhookRouter>;

  beforeEach(() => {
    router = createBitbucketWebhookRouter();
    vi.clearAllMocks();
    mockPRState = { pr: null, reviewerStatuses: new Map() };
    mockCalls.usersCreated = [];
    mockCalls.prsCreated = [];
    mockCalls.eventsLogged = [];
    mockCalls.reviewerStatusUpdates = [];
    mockCalls.prStateUpdates = [];
    mockCalls.notificationsSent = [];
  });

  it("should handle approval event for PR not yet in database", async () => {
    // Simulate receiving approval event before created event (race condition)
    const res = await sendWebhook(
      router,
      "pullrequest:approved",
      scenarioFeaturePR.reviewer1Approved()
    );

    expect(res.statusCode).toBe(200);
    // Should create the PR first, then process approval
    expect(prService.createOrUpdatePR).toHaveBeenCalled();
  });

  it("should handle multiple rapid approvals", async () => {
    // Create PR first
    await sendWebhook(router, "pullrequest:created", scenarioFeaturePR.created());

    // Simulate near-simultaneous approvals
    const approvalPromises = [
      sendWebhook(router, "pullrequest:approved", scenarioFeaturePR.reviewer1Approved()),
      sendWebhook(router, "pullrequest:approved", scenarioFeaturePR.reviewer2Approved()),
      sendWebhook(router, "pullrequest:approved", scenarioFeaturePR.reviewer3Approved()),
    ];

    const results = await Promise.all(approvalPromises);

    results.forEach((res) => {
      expect(res.statusCode).toBe(200);
    });

    expect(prService.updateReviewerStatus).toHaveBeenCalledTimes(3);
  });

  it("should handle PR with no reviewers", async () => {
    const prWithNoReviewers = {
      ...scenarioFeaturePR.created(),
      pullrequest: {
        ...scenarioFeaturePR.created().pullrequest,
        reviewers: [],
      },
    };

    const res = await sendWebhook(router, "pullrequest:created", prWithNoReviewers);

    expect(res.statusCode).toBe(200);
    expect(prService.createOrUpdatePR).toHaveBeenCalled();
    // Notification should still be called (it will be a no-op with no reviewers)
    expect(notificationService.notifyReviewersOnPRCreated).toHaveBeenCalled();
  });

  it("should handle PR update after merge (late webhook)", async () => {
    // Create and merge PR
    await sendWebhook(router, "pullrequest:created", scenarioHotfixPR.created());
    await sendWebhook(router, "pullrequest:approved", scenarioHotfixPR.approved());
    await sendWebhook(router, "pullrequest:fulfilled", scenarioHotfixPR.merged());

    // Late update event arrives (should still process without error)
    const lateUpdatePayload = {
      ...scenarioHotfixPR.created(),
      pullrequest: {
        ...scenarioHotfixPR.created().pullrequest,
        state: "MERGED" as const,
      },
    };

    const res = await sendWebhook(router, "pullrequest:updated", lateUpdatePayload);

    expect(res.statusCode).toBe(200);
  });
});

describe("PR Lifecycle - Event Logging Verification", () => {
  let router: ReturnType<typeof createBitbucketWebhookRouter>;

  beforeEach(() => {
    router = createBitbucketWebhookRouter();
    vi.clearAllMocks();
    mockPRState = { pr: null, reviewerStatuses: new Map() };
    mockCalls.eventsLogged = [];
  });

  it("should log all events with correct event types and actors", async () => {
    // Complete flow
    await sendWebhook(router, "pullrequest:created", scenarioFeaturePR.created());
    await sendWebhook(router, "pullrequest:approved", scenarioFeaturePR.reviewer1Approved());
    await sendWebhook(
      router,
      "pullrequest:changes_request_created",
      scenarioFeaturePR.reviewer2ChangesRequested()
    );
    await sendWebhook(router, "pullrequest:updated", scenarioFeaturePR.authorUpdated());
    await sendWebhook(router, "pullrequest:fulfilled", scenarioFeaturePR.merged());

    // Verify event sequence
    expect(mockCalls.eventsLogged).toEqual(
      expect.arrayContaining([
        { eventType: "PR_CREATED", actorUuid: testUsers.author.uuid },
        { eventType: "PR_APPROVED", actorUuid: testUsers.reviewer1.uuid },
        { eventType: "PR_CHANGES_REQUESTED", actorUuid: testUsers.reviewer2.uuid },
        { eventType: "PR_UPDATED", actorUuid: testUsers.author.uuid },
        { eventType: "PR_MERGED", actorUuid: testUsers.author.uuid },
      ])
    );
  });

  it("should maintain audit trail even for declined PRs", async () => {
    await sendWebhook(router, "pullrequest:created", scenarioDeclinedPR.created());
    await sendWebhook(router, "pullrequest:comment_created", scenarioDeclinedPR.comment1());
    await sendWebhook(router, "pullrequest:rejected", scenarioDeclinedPR.declined());

    const eventTypes = mockCalls.eventsLogged.map((e) => e.eventType);
    expect(eventTypes).toContain("PR_CREATED");
    expect(eventTypes).toContain("PR_COMMENT_ADDED");
    expect(eventTypes).toContain("PR_DECLINED");
  });
});
