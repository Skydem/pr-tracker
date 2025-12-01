/**
 * Functional tests for reviewer workflows.
 * Tests reviewer status transitions, multiple reviewers, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../src/db/client.js";
import { PRService } from "../../src/services/pr.service.js";
import { UserService } from "../../src/services/user.service.js";
import {
  testUsers,
  mockDbUsers,
  mockDbPRs,
  mockDbReviewers,
  createPRWithReviewers,
  createPRCreatedPayload,
} from "../fixtures/bitbucket-payloads.js";

// =============================================================================
// Mock Setup - Using actual Prisma mock from setup.ts
// =============================================================================

// The prisma mock is already set up in setup.ts
// We just need to configure the mock returns for each test

describe("Reviewer Workflow - Status Transitions", () => {
  let prService: PRService;
  let userService: UserService;

  beforeEach(() => {
    prService = new PRService();
    userService = new UserService();
    vi.clearAllMocks();
  });

  describe("updateReviewerStatus", () => {
    it("should transition reviewer from PENDING to APPROVED", async () => {
      // Setup: User exists
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockDbUsers.reviewer1);
      vi.mocked(prisma.pRReviewer.updateMany).mockResolvedValueOnce({ count: 1 });

      await prService.updateReviewerStatus(
        mockDbPRs.openPR.id,
        testUsers.reviewer1.uuid,
        "APPROVED"
      );

      expect(prisma.pRReviewer.updateMany).toHaveBeenCalledWith({
        where: {
          pullRequestId: mockDbPRs.openPR.id,
          userId: mockDbUsers.reviewer1.id,
        },
        data: { status: "APPROVED" },
      });
    });

    it("should transition reviewer from PENDING to CHANGES_REQUESTED", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockDbUsers.reviewer1);
      vi.mocked(prisma.pRReviewer.updateMany).mockResolvedValueOnce({ count: 1 });

      await prService.updateReviewerStatus(
        mockDbPRs.openPR.id,
        testUsers.reviewer1.uuid,
        "CHANGES_REQUESTED"
      );

      expect(prisma.pRReviewer.updateMany).toHaveBeenCalledWith({
        where: {
          pullRequestId: mockDbPRs.openPR.id,
          userId: mockDbUsers.reviewer1.id,
        },
        data: { status: "CHANGES_REQUESTED" },
      });
    });

    it("should transition reviewer from CHANGES_REQUESTED to APPROVED after re-review", async () => {
      // Reviewer previously requested changes, now approves
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockDbUsers.reviewer2);
      vi.mocked(prisma.pRReviewer.updateMany).mockResolvedValueOnce({ count: 1 });

      await prService.updateReviewerStatus(
        mockDbPRs.openPR.id,
        testUsers.reviewer2.uuid,
        "APPROVED"
      );

      expect(prisma.pRReviewer.updateMany).toHaveBeenCalledWith({
        where: {
          pullRequestId: mockDbPRs.openPR.id,
          userId: mockDbUsers.reviewer2.id,
        },
        data: { status: "APPROVED" },
      });
    });

    it("should handle status update for unknown user gracefully", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      // Should not throw
      await prService.updateReviewerStatus(
        mockDbPRs.openPR.id,
        "{unknown-uuid}",
        "APPROVED"
      );

      // Should not attempt to update
      expect(prisma.pRReviewer.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("areAllReviewersApproved", () => {
    it("should return true when all reviewers have approved", async () => {
      const allApprovedReviewers = [
        { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" as const },
        { ...mockDbReviewers.pr42Reviewer2, status: "APPROVED" as const },
        { ...mockDbReviewers.pr42Reviewer3, status: "APPROVED" as const },
      ];

      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(allApprovedReviewers);

      const result = await prService.areAllReviewersApproved(mockDbPRs.openPR.id);

      expect(result).toBe(true);
    });

    it("should return false when at least one reviewer is PENDING", async () => {
      const mixedReviewers = [
        { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" as const },
        { ...mockDbReviewers.pr42Reviewer2, status: "PENDING" as const },
        { ...mockDbReviewers.pr42Reviewer3, status: "APPROVED" as const },
      ];

      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(mixedReviewers);

      const result = await prService.areAllReviewersApproved(mockDbPRs.openPR.id);

      expect(result).toBe(false);
    });

    it("should return false when at least one reviewer has CHANGES_REQUESTED", async () => {
      const mixedReviewers = [
        { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" as const },
        { ...mockDbReviewers.pr42Reviewer2, status: "CHANGES_REQUESTED" as const },
      ];

      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(mixedReviewers);

      const result = await prService.areAllReviewersApproved(mockDbPRs.openPR.id);

      expect(result).toBe(false);
    });

    it("should return false when there are no reviewers", async () => {
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce([]);

      const result = await prService.areAllReviewersApproved(mockDbPRs.openPR.id);

      expect(result).toBe(false);
    });
  });

  describe("getReviewersWithStatus", () => {
    it("should return only reviewers with PENDING status", async () => {
      const pendingReviewers = [
        {
          ...mockDbReviewers.pr42Reviewer1,
          status: "PENDING" as const,
          user: { id: mockDbUsers.reviewer1.id, slackUserId: mockDbUsers.reviewer1.slackUserId },
        },
      ];

      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(pendingReviewers);

      const result = await prService.getReviewersWithStatus(mockDbPRs.openPR.id, "PENDING");

      expect(result).toHaveLength(1);
      expect(result[0].slackUserId).toBe(mockDbUsers.reviewer1.slackUserId);
    });

    it("should return only reviewers with CHANGES_REQUESTED status", async () => {
      const changesRequestedReviewers = [
        {
          ...mockDbReviewers.pr42Reviewer2,
          status: "CHANGES_REQUESTED" as const,
          user: { id: mockDbUsers.reviewer2.id, slackUserId: mockDbUsers.reviewer2.slackUserId },
        },
      ];

      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(changesRequestedReviewers);

      const result = await prService.getReviewersWithStatus(
        mockDbPRs.openPR.id,
        "CHANGES_REQUESTED"
      );

      expect(result).toHaveLength(1);
      expect(result[0].slackUserId).toBe(mockDbUsers.reviewer2.slackUserId);
    });

    it("should return empty array when no reviewers match status", async () => {
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce([]);

      const result = await prService.getReviewersWithStatus(mockDbPRs.openPR.id, "APPROVED");

      expect(result).toHaveLength(0);
    });

    it("should handle reviewers without Slack linked", async () => {
      const reviewerWithoutSlack = [
        {
          ...mockDbReviewers.pr42Reviewer1,
          status: "PENDING" as const,
          user: { id: "user-no-slack", slackUserId: null },
        },
      ];

      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(reviewerWithoutSlack);

      const result = await prService.getReviewersWithStatus(mockDbPRs.openPR.id, "PENDING");

      expect(result).toHaveLength(1);
      expect(result[0].slackUserId).toBeNull();
    });
  });
});

describe("Reviewer Workflow - Sync Reviewers", () => {
  let prService: PRService;

  beforeEach(() => {
    prService = new PRService();
    vi.clearAllMocks();
  });

  describe("createOrUpdatePR with reviewer changes", () => {
    it("should add new reviewers when PR is updated with additional reviewers", async () => {
      // Setup existing PR with 1 reviewer
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockDbUsers.author);
      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValueOnce(mockDbPRs.openPR);
      vi.mocked(prisma.pullRequest.update).mockResolvedValueOnce(mockDbPRs.openPR);

      // Existing reviewer (with user data for include: { user: true })
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce([
        { ...mockDbReviewers.pr42Reviewer1, userId: mockDbUsers.reviewer1.id, user: mockDbUsers.reviewer1 },
      ]);

      // User lookups for sync
      vi.mocked(prisma.user.findFirst)
        .mockResolvedValueOnce(mockDbUsers.author) // author lookup
        .mockResolvedValueOnce(mockDbUsers.reviewer1) // reviewer1 lookup
        .mockResolvedValueOnce(mockDbUsers.reviewer2); // new reviewer2 lookup

      vi.mocked(prisma.pRReviewer.createMany).mockResolvedValue({ count: 1 });

      // Mock final PR fetch
      vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockResolvedValueOnce({
        ...mockDbPRs.openPR,
        reviewers: [
          {
            ...mockDbReviewers.pr42Reviewer1,
            user: { displayName: mockDbUsers.reviewer1.displayName, slackUserId: mockDbUsers.reviewer1.slackUserId },
          },
        ],
        author: { displayName: mockDbUsers.author.displayName, slackUserId: mockDbUsers.author.slackUserId },
      } as never);

      const payload = createPRCreatedPayload(42, "Test PR", [testUsers.reviewer1, testUsers.reviewer2]);

      await prService.createOrUpdatePR(payload.pullrequest, "acme-corp");

      // Verify new reviewer was created (using batch createMany)
      expect(prisma.pRReviewer.createMany).toHaveBeenCalled();
    });

    it("should remove reviewers when they are removed from PR", async () => {
      // Setup existing PR with 2 reviewers
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockDbUsers.author);
      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValueOnce(mockDbPRs.openPR);
      vi.mocked(prisma.pullRequest.update).mockResolvedValueOnce(mockDbPRs.openPR);

      // Existing reviewers (with user data for include: { user: true })
      const existingReviewers = [
        { ...mockDbReviewers.pr42Reviewer1, userId: mockDbUsers.reviewer1.id, user: mockDbUsers.reviewer1 },
        { ...mockDbReviewers.pr42Reviewer2, userId: mockDbUsers.reviewer2.id, user: mockDbUsers.reviewer2 },
      ];
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(existingReviewers);

      // User lookups
      vi.mocked(prisma.user.findFirst)
        .mockResolvedValueOnce(mockDbUsers.author)
        .mockResolvedValueOnce(mockDbUsers.reviewer1);

      vi.mocked(prisma.pRReviewer.deleteMany).mockResolvedValue({ count: 1 });

      // Mock final PR fetch
      vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockResolvedValueOnce({
        ...mockDbPRs.openPR,
        reviewers: [],
        author: { displayName: mockDbUsers.author.displayName, slackUserId: mockDbUsers.author.slackUserId },
      } as never);

      // PR now has only reviewer1 (reviewer2 removed)
      const payload = createPRCreatedPayload(42, "Test PR", [testUsers.reviewer1]);

      await prService.createOrUpdatePR(payload.pullrequest, "acme-corp");

      // Verify removed reviewer was deleted (using batch deleteMany)
      expect(prisma.pRReviewer.deleteMany).toHaveBeenCalled();
    });
  });
});

describe("Reviewer Workflow - PRs Awaiting Review", () => {
  let prService: PRService;

  beforeEach(() => {
    prService = new PRService();
    vi.clearAllMocks();
  });

  it("should return PRs where user is a PENDING reviewer", async () => {
    const mockPRsAwaitingReview = [
      {
        pullRequest: {
          ...mockDbPRs.openPR,
          reviewers: [
            {
              ...mockDbReviewers.pr42Reviewer1,
              user: { displayName: mockDbUsers.reviewer1.displayName, slackUserId: mockDbUsers.reviewer1.slackUserId },
            },
          ],
          author: { displayName: mockDbUsers.author.displayName, slackUserId: mockDbUsers.author.slackUserId },
        },
      },
    ];

    vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(mockPRsAwaitingReview as never);

    const result = await prService.getPRsAwaitingReview(mockDbUsers.reviewer1.id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(mockDbPRs.openPR.title);
  });

  it("should not return PRs where user has already approved", async () => {
    // Query returns empty because PENDING filter excludes approved PRs
    vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce([]);

    const result = await prService.getPRsAwaitingReview(mockDbUsers.reviewer1.id);

    expect(result).toHaveLength(0);
  });

  it("should not return merged PRs even if review is pending", async () => {
    // The query filters out non-OPEN PRs, so it returns empty
    vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce([]);

    const result = await prService.getPRsAwaitingReview(mockDbUsers.reviewer1.id);

    expect(result).toHaveLength(0);
    expect(prisma.pRReviewer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pullRequest: { state: "OPEN" },
        }),
      })
    );
  });
});

describe("Reviewer Workflow - Multiple Reviewers Scenarios", () => {
  let prService: PRService;

  beforeEach(() => {
    prService = new PRService();
    vi.clearAllMocks();
  });

  it("should track independent review statuses for each reviewer", async () => {
    // Each reviewer has their own status
    const reviewersWithMixedStatus = [
      { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" as const },
      { ...mockDbReviewers.pr42Reviewer2, status: "CHANGES_REQUESTED" as const },
      { ...mockDbReviewers.pr42Reviewer3, status: "PENDING" as const },
    ];

    vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(reviewersWithMixedStatus);

    const allApproved = await prService.areAllReviewersApproved(mockDbPRs.openPR.id);

    expect(allApproved).toBe(false);
  });

  it("should correctly identify when only one reviewer remains pending", async () => {
    // Get pending reviewers
    const pendingReviewers = [
      {
        ...mockDbReviewers.pr42Reviewer3,
        status: "PENDING" as const,
        user: { id: mockDbUsers.reviewer3.id, slackUserId: mockDbUsers.reviewer3.slackUserId },
      },
    ];

    vi.mocked(prisma.pRReviewer.findMany).mockResolvedValueOnce(pendingReviewers);

    const result = await prService.getReviewersWithStatus(mockDbPRs.openPR.id, "PENDING");

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(mockDbUsers.reviewer3.id);
  });
});

describe("Reviewer Workflow - User Service Integration", () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  describe("findOrCreateUser for reviewers", () => {
    it("should find existing user by Bitbucket UUID", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockDbUsers.reviewer1);

      const result = await userService.findOrCreateUser(
        testUsers.reviewer1.uuid,
        null,
        testUsers.reviewer1.display_name
      );

      expect(result).toEqual(mockDbUsers.reviewer1);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should create new user for unknown reviewer", async () => {
      const newUser = {
        id: "new-user-uuid",
        bitbucketUuid: "{new-uuid}",
        bitbucketEmail: null,
        slackUserId: null,
        displayName: "New Reviewer",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce(newUser);

      const result = await userService.findOrCreateUser(
        "{new-uuid}",
        null,
        "New Reviewer"
      );

      expect(result).toEqual(newUser);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          bitbucketUuid: "{new-uuid}",
          bitbucketEmail: null,
          displayName: "New Reviewer",
        },
      });
    });

    it("should update existing user with missing Bitbucket UUID", async () => {
      const existingUser = {
        ...mockDbUsers.reviewer1,
        bitbucketUuid: null, // Missing UUID
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...existingUser,
        bitbucketUuid: testUsers.reviewer1.uuid,
      });

      const result = await userService.findOrCreateUser(
        testUsers.reviewer1.uuid,
        null,
        testUsers.reviewer1.display_name
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existingUser.id },
        data: expect.objectContaining({
          bitbucketUuid: testUsers.reviewer1.uuid,
        }),
      });
    });
  });

  describe("getUserByBitbucketUuid", () => {
    it("should return user when found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockDbUsers.reviewer1);

      const result = await userService.getUserByBitbucketUuid(testUsers.reviewer1.uuid);

      expect(result).toEqual(mockDbUsers.reviewer1);
    });

    it("should return null when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const result = await userService.getUserByBitbucketUuid("{unknown-uuid}");

      expect(result).toBeNull();
    });
  });
});
