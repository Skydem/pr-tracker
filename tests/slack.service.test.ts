import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlackService } from "../src/services/slack.service.js";
import type { PRWithReviewers } from "../src/services/pr.service.js";

describe("SlackService", () => {
  let slackService: SlackService;

  const mockPR: PRWithReviewers = {
    id: "pr-1",
    bitbucketId: 123,
    repositorySlug: "test-repo",
    workspaceSlug: "workspace",
    title: "Test PR Title",
    sourceBranch: "feature-branch",
    destBranch: "main",
    state: "OPEN",
    url: "https://bitbucket.org/workspace/test-repo/pull-requests/123",
    authorId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewers: [
      {
        id: "r1",
        pullRequestId: "pr-1",
        userId: "u1",
        status: "PENDING",
        updatedAt: new Date(),
        user: { displayName: "Reviewer One", slackUserId: "slack-r1" },
      },
    ],
    author: { displayName: "Test Author", slackUserId: "slack-author" },
  };

  beforeEach(() => {
    slackService = new SlackService();
    vi.clearAllMocks();
  });

  describe("buildPRCreatedMessage", () => {
    it("should build correct message blocks", () => {
      const { blocks, text } = slackService.buildPRCreatedMessage(mockPR);

      expect(text).toContain("reviewer");
      expect(text).toContain("Test PR Title");
      expect(blocks).toBeInstanceOf(Array);
      expect(blocks.length).toBeGreaterThan(0);

      const sectionBlock = blocks.find((b: { type: string }) => b.type === "section");
      expect(sectionBlock).toBeDefined();
    });
  });

  describe("buildPRUpdatedMessage", () => {
    it("should build correct message blocks", () => {
      const { blocks, text } = slackService.buildPRUpdatedMessage(mockPR);

      expect(text).toContain("Test Author");
      expect(text).toContain("Test PR Title");
      expect(blocks).toBeInstanceOf(Array);
    });
  });

  describe("buildChangesRequestedMessage", () => {
    it("should include reviewer name in message", () => {
      const { blocks, text } = slackService.buildChangesRequestedMessage(
        mockPR,
        "John Doe"
      );

      expect(text).toContain("John Doe");
      expect(text).toContain("requested changes");
      expect(blocks).toBeInstanceOf(Array);
    });
  });

  describe("buildAllApprovedMessage", () => {
    it("should indicate all reviewers approved", () => {
      const { blocks, text } = slackService.buildAllApprovedMessage(mockPR);

      expect(text).toContain("All reviewers approved");
      expect(blocks).toBeInstanceOf(Array);
    });
  });

  describe("buildCommentAddedMessage", () => {
    it("should include commenter name", () => {
      const { blocks, text } = slackService.buildCommentAddedMessage(
        mockPR,
        "Jane Smith"
      );

      expect(text).toContain("Jane Smith");
      expect(text).toContain("commented");
      expect(blocks).toBeInstanceOf(Array);
    });
  });

  describe("buildNudgeMessage", () => {
    it("should build reminder message", () => {
      const { blocks, text } = slackService.buildNudgeMessage(mockPR);

      expect(text).toContain("Reminder");
      expect(text).toContain("review");
      expect(blocks).toBeInstanceOf(Array);
    });
  });

  describe("sendDM", () => {
    it("should log error when app not initialized", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await slackService.sendDM("slack-123", [], "test message");

      expect(consoleSpy).toHaveBeenCalledWith("Slack app not initialized");
      consoleSpy.mockRestore();
    });

    it("should send message when app is initialized", async () => {
      const mockPostMessage = vi.fn().mockResolvedValue({ ok: true });
      const mockApp = {
        client: {
          chat: {
            postMessage: mockPostMessage,
          },
        },
      };

      slackService.setApp(mockApp as never);

      await slackService.sendDM("slack-123", [{ type: "section" }], "test");

      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: "slack-123",
        blocks: [{ type: "section" }],
        text: "test",
      });
    });
  });
});
