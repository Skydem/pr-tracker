import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "../src/services/notification.service.js";
import type { PRWithReviewers } from "../src/services/pr.service.js";

vi.mock("../src/services/pr.service.js", () => ({
  prService: {
    getReviewersWithStatus: vi.fn(),
    areAllReviewersApproved: vi.fn(),
    getPRWithReviewers: vi.fn(),
  },
}));

vi.mock("../src/services/slack.service.js", () => ({
  slackService: {
    sendDM: vi.fn(),
    buildPRCreatedMessage: vi.fn().mockReturnValue({ blocks: [], text: "test" }),
    buildPRUpdatedMessage: vi.fn().mockReturnValue({ blocks: [], text: "test" }),
    buildChangesRequestedMessage: vi.fn().mockReturnValue({ blocks: [], text: "test" }),
    buildAllApprovedMessage: vi.fn().mockReturnValue({ blocks: [], text: "test" }),
    buildCommentAddedMessage: vi.fn().mockReturnValue({ blocks: [], text: "test" }),
    buildNudgeMessage: vi.fn().mockReturnValue({ blocks: [], text: "test" }),
  },
}));

vi.mock("../src/services/user.service.js", () => ({
  userService: {
    getUserByBitbucketUuid: vi.fn(),
  },
}));

import { prisma } from "../src/db/client.js";
import { prService } from "../src/services/pr.service.js";
import { slackService } from "../src/services/slack.service.js";

describe("NotificationService", () => {
  let notificationService: NotificationService;

  const mockPR: PRWithReviewers = {
    id: "pr-1",
    bitbucketId: 123,
    repositorySlug: "test-repo",
    workspaceSlug: "workspace",
    title: "Test PR",
    sourceBranch: "feature",
    destBranch: "main",
    state: "OPEN",
    url: "https://example.com/pr/123",
    authorId: "author-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewers: [
      {
        id: "r1",
        pullRequestId: "pr-1",
        userId: "u1",
        status: "PENDING",
        updatedAt: new Date(),
        user: { displayName: "Reviewer 1", slackUserId: "slack-r1" },
      },
      {
        id: "r2",
        pullRequestId: "pr-1",
        userId: "u2",
        status: "PENDING",
        updatedAt: new Date(),
        user: { displayName: "Reviewer 2", slackUserId: "slack-r2" },
      },
    ],
    author: { displayName: "Author", slackUserId: "slack-author" },
  };

  beforeEach(() => {
    notificationService = new NotificationService();
    vi.clearAllMocks();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  });

  describe("notifyReviewersOnPRCreated", () => {
    it("should notify all reviewers with slack accounts", async () => {
      await notificationService.notifyReviewersOnPRCreated(mockPR);

      expect(slackService.buildPRCreatedMessage).toHaveBeenCalledWith(mockPR);
      expect(slackService.sendDM).toHaveBeenCalledTimes(2);
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-r1", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-r2", [], "test");
    });

    it("should skip reviewers without slack accounts", async () => {
      const prWithNoSlack = {
        ...mockPR,
        reviewers: [
          {
            id: "r1",
            pullRequestId: "pr-1",
            userId: "u1",
            status: "PENDING" as const,
            updatedAt: new Date(),
            user: { displayName: "Reviewer 1", slackUserId: null },
          },
        ],
      };

      await notificationService.notifyReviewersOnPRCreated(prWithNoSlack);

      expect(slackService.sendDM).not.toHaveBeenCalled();
    });
  });

  describe("notifyReviewersOnPRUpdated", () => {
    it("should notify reviewers who requested changes", async () => {
      vi.mocked(prService.getReviewersWithStatus).mockResolvedValue([
        { userId: "u1", slackUserId: "slack-r1" },
      ]);

      await notificationService.notifyReviewersOnPRUpdated(mockPR);

      expect(prService.getReviewersWithStatus).toHaveBeenCalledWith(
        "pr-1",
        "CHANGES_REQUESTED"
      );
      expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    });

    it("should not notify if no reviewers requested changes", async () => {
      vi.mocked(prService.getReviewersWithStatus).mockResolvedValue([]);

      await notificationService.notifyReviewersOnPRUpdated(mockPR);

      expect(slackService.sendDM).not.toHaveBeenCalled();
    });
  });

  describe("notifyAuthorOnChangesRequested", () => {
    it("should notify author", async () => {
      await notificationService.notifyAuthorOnChangesRequested(
        mockPR,
        "Reviewer Name"
      );

      expect(slackService.buildChangesRequestedMessage).toHaveBeenCalledWith(
        mockPR,
        "Reviewer Name"
      );
      expect(slackService.sendDM).toHaveBeenCalledWith(
        "slack-author",
        [],
        "test"
      );
    });

    it("should not notify if author has no slack account", async () => {
      const prWithNoSlack = {
        ...mockPR,
        author: { displayName: "Author", slackUserId: null },
      };

      await notificationService.notifyAuthorOnChangesRequested(
        prWithNoSlack,
        "Reviewer"
      );

      expect(slackService.sendDM).not.toHaveBeenCalled();
    });
  });

  describe("notifyAuthorOnAllApproved", () => {
    it("should notify author when all approved", async () => {
      vi.mocked(prService.areAllReviewersApproved).mockResolvedValue(true);

      await notificationService.notifyAuthorOnAllApproved(mockPR);

      expect(slackService.sendDM).toHaveBeenCalledWith(
        "slack-author",
        [],
        "test"
      );
    });

    it("should not notify if not all approved", async () => {
      vi.mocked(prService.areAllReviewersApproved).mockResolvedValue(false);

      await notificationService.notifyAuthorOnAllApproved(mockPR);

      expect(slackService.sendDM).not.toHaveBeenCalled();
    });
  });

  describe("nudgeReviewers", () => {
    it("should nudge pending reviewers and return count", async () => {
      vi.mocked(prService.getReviewersWithStatus).mockResolvedValue([
        { userId: "u1", slackUserId: "slack-r1" },
        { userId: "u2", slackUserId: "slack-r2" },
      ]);

      const count = await notificationService.nudgeReviewers(mockPR);

      expect(count).toBe(2);
      expect(slackService.sendDM).toHaveBeenCalledTimes(2);
    });

    it("should return 0 if no pending reviewers with slack", async () => {
      vi.mocked(prService.getReviewersWithStatus).mockResolvedValue([
        { userId: "u1", slackUserId: null },
      ]);

      const count = await notificationService.nudgeReviewers(mockPR);

      expect(count).toBe(0);
    });
  });

  describe("watcher notifications", () => {
    it("should notify watchers on PR created in addition to reviewers", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { slackUserId: "slack-watcher1" },
        { slackUserId: "slack-watcher2" },
      ] as never);

      await notificationService.notifyReviewersOnPRCreated(mockPR);

      expect(slackService.sendDM).toHaveBeenCalledTimes(4);
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-r1", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-r2", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-watcher1", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-watcher2", [], "test");
    });

    it("should not send duplicate notification to watcher who is also reviewer", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { slackUserId: "slack-r1" },
        { slackUserId: "slack-watcher1" },
      ] as never);

      await notificationService.notifyReviewersOnPRCreated(mockPR);

      expect(slackService.sendDM).toHaveBeenCalledTimes(3);
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-r1", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-r2", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-watcher1", [], "test");
    });

    it("should notify watchers on all approved in addition to author", async () => {
      vi.mocked(prService.areAllReviewersApproved).mockResolvedValue(true);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { slackUserId: "slack-watcher1" },
      ] as never);

      await notificationService.notifyAuthorOnAllApproved(mockPR);

      expect(slackService.sendDM).toHaveBeenCalledTimes(2);
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-author", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-watcher1", [], "test");
    });

    it("should not send duplicate notification to watcher who is also author", async () => {
      vi.mocked(prService.areAllReviewersApproved).mockResolvedValue(true);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { slackUserId: "slack-author" },
        { slackUserId: "slack-watcher1" },
      ] as never);

      await notificationService.notifyAuthorOnAllApproved(mockPR);

      expect(slackService.sendDM).toHaveBeenCalledTimes(2);
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-author", [], "test");
      expect(slackService.sendDM).toHaveBeenCalledWith("slack-watcher1", [], "test");
    });
  });
});
