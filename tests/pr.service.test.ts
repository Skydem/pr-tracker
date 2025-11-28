import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { PRService } from "../src/services/pr.service.js";
import type { BitbucketPullRequest } from "../src/types/bitbucket.types.js";

vi.mock("../src/services/user.service.js", () => ({
  userService: {
    findOrCreateUser: vi.fn(),
    getUserByBitbucketUuid: vi.fn(),
  },
}));

import { userService } from "../src/services/user.service.js";

describe("PRService", () => {
  let prService: PRService;

  const mockUser = {
    id: "user-1",
    bitbucketUuid: "bb-uuid-1",
    bitbucketEmail: "test@example.com",
    slackUserId: "slack-1",
    displayName: "Test Author",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPR: BitbucketPullRequest = {
    id: 123,
    title: "Test PR",
    description: "Test description",
    state: "OPEN",
    source: {
      branch: { name: "feature-branch" },
      repository: {
        name: "test-repo",
        full_name: "workspace/test-repo",
        uuid: "repo-uuid",
        workspace: { slug: "workspace", name: "Workspace", uuid: "ws-uuid" },
      },
    },
    destination: {
      branch: { name: "main" },
      repository: {
        name: "test-repo",
        full_name: "workspace/test-repo",
        uuid: "repo-uuid",
        workspace: { slug: "workspace", name: "Workspace", uuid: "ws-uuid" },
      },
    },
    author: {
      display_name: "Test Author",
      uuid: "author-uuid",
      nickname: "testauthor",
      type: "user",
      account_id: "account-1",
    },
    reviewers: [
      {
        display_name: "Reviewer One",
        uuid: "reviewer-uuid-1",
        nickname: "reviewer1",
        type: "user",
        account_id: "account-2",
      },
    ],
    links: {
      html: { href: "https://bitbucket.org/workspace/test-repo/pull-requests/123" },
    },
    created_on: "2024-01-01T00:00:00Z",
    updated_on: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    prService = new PRService();
    vi.clearAllMocks();
  });

  describe("createOrUpdatePR", () => {
    it("should create a new PR when it does not exist", async () => {
      vi.mocked(userService.findOrCreateUser).mockResolvedValue(mockUser);
      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue(null);

      const createdPR = {
        id: "pr-1",
        bitbucketId: 123,
        repositorySlug: "test-repo",
        workspaceSlug: "workspace",
        title: "Test PR",
        sourceBranch: "feature-branch",
        destBranch: "main",
        state: "OPEN" as const,
        url: "https://bitbucket.org/workspace/test-repo/pull-requests/123",
        authorId: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.pullRequest.create).mockResolvedValue(createdPR);
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockResolvedValue({
        ...createdPR,
        reviewers: [],
        author: { displayName: "Test Author", slackUserId: "slack-1" },
      } as never);

      const result = await prService.createOrUpdatePR(mockPR, "workspace");

      expect(prisma.pullRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bitbucketId: 123,
          title: "Test PR",
          sourceBranch: "feature-branch",
          destBranch: "main",
        }),
      });
      expect(result).toBeDefined();
    });

    it("should update existing PR", async () => {
      vi.mocked(userService.findOrCreateUser).mockResolvedValue(mockUser);

      const existingPR = {
        id: "pr-1",
        bitbucketId: 123,
        repositorySlug: "test-repo",
        workspaceSlug: "workspace",
        title: "Old Title",
        sourceBranch: "feature-branch",
        destBranch: "main",
        state: "OPEN" as const,
        url: null,
        authorId: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue(existingPR);
      vi.mocked(prisma.pullRequest.update).mockResolvedValue({
        ...existingPR,
        title: "Test PR",
      });
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockResolvedValue({
        ...existingPR,
        title: "Test PR",
        reviewers: [],
        author: { displayName: "Test Author", slackUserId: "slack-1" },
      } as never);

      const result = await prService.createOrUpdatePR(mockPR, "workspace");

      expect(prisma.pullRequest.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("updateReviewerStatus", () => {
    it("should update reviewer status", async () => {
      vi.mocked(userService.getUserByBitbucketUuid).mockResolvedValue(mockUser);
      vi.mocked(prisma.pRReviewer.updateMany).mockResolvedValue({ count: 1 });

      await prService.updateReviewerStatus("pr-1", "bb-uuid-1", "APPROVED");

      expect(prisma.pRReviewer.updateMany).toHaveBeenCalledWith({
        where: {
          pullRequestId: "pr-1",
          userId: "user-1",
        },
        data: { status: "APPROVED" },
      });
    });

    it("should do nothing if user not found", async () => {
      vi.mocked(userService.getUserByBitbucketUuid).mockResolvedValue(null);

      await prService.updateReviewerStatus("pr-1", "unknown-uuid", "APPROVED");

      expect(prisma.pRReviewer.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("areAllReviewersApproved", () => {
    it("should return true when all reviewers approved", async () => {
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValue([
        { id: "r1", pullRequestId: "pr-1", userId: "u1", status: "APPROVED", updatedAt: new Date() },
        { id: "r2", pullRequestId: "pr-1", userId: "u2", status: "APPROVED", updatedAt: new Date() },
      ]);

      const result = await prService.areAllReviewersApproved("pr-1");

      expect(result).toBe(true);
    });

    it("should return false when some reviewers pending", async () => {
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValue([
        { id: "r1", pullRequestId: "pr-1", userId: "u1", status: "APPROVED", updatedAt: new Date() },
        { id: "r2", pullRequestId: "pr-1", userId: "u2", status: "PENDING", updatedAt: new Date() },
      ]);

      const result = await prService.areAllReviewersApproved("pr-1");

      expect(result).toBe(false);
    });

    it("should return false when no reviewers", async () => {
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValue([]);

      const result = await prService.areAllReviewersApproved("pr-1");

      expect(result).toBe(false);
    });
  });

  describe("getReviewersWithStatus", () => {
    it("should return reviewers with specific status", async () => {
      vi.mocked(prisma.pRReviewer.findMany).mockResolvedValue([
        {
          id: "r1",
          pullRequestId: "pr-1",
          userId: "u1",
          status: "CHANGES_REQUESTED",
          updatedAt: new Date(),
          user: { id: "u1", slackUserId: "slack-1" },
        },
      ] as never);

      const result = await prService.getReviewersWithStatus(
        "pr-1",
        "CHANGES_REQUESTED"
      );

      expect(result).toHaveLength(1);
      expect(result[0].slackUserId).toBe("slack-1");
    });
  });

  describe("updatePRState", () => {
    it("should update PR state", async () => {
      vi.mocked(prisma.pullRequest.update).mockResolvedValue({} as never);

      await prService.updatePRState("pr-1", "MERGED");

      expect(prisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: { state: "MERGED" },
      });
    });
  });
});
