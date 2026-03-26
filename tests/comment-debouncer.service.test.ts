import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PRWithReviewers } from "../src/services/pr.service.js";

vi.mock("../src/services/notification.service.js", () => ({
  notificationService: {
    notifyAuthorOnComment: vi.fn(),
    notifyAuthorOnBatchedComments: vi.fn(),
  },
}));

import { notificationService } from "../src/services/notification.service.js";
import { CommentDebouncerService } from "../src/services/comment-debouncer.service.js";

const createMockPR = (id: string): PRWithReviewers => ({
  id,
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
  reviewers: [],
  author: { displayName: "Author", slackUserId: "slack-author" },
});

describe("CommentDebouncerService", () => {
  let debouncer: CommentDebouncerService;
  const mockPR = createMockPR("pr-1");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    debouncer = new CommentDebouncerService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should send single comment notification after debounce window", async () => {
    debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter Name");

    expect(notificationService.notifyAuthorOnComment).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledOnce();
    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledWith(
      mockPR,
      "commenter-uuid",
      "Commenter Name"
    );
    expect(notificationService.notifyAuthorOnBatchedComments).not.toHaveBeenCalled();
  });

  it("should batch multiple comments into one notification", async () => {
    for (let i = 0; i < 5; i++) {
      debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter Name");
    }

    await vi.advanceTimersByTimeAsync(10_000);

    expect(notificationService.notifyAuthorOnBatchedComments).toHaveBeenCalledOnce();
    expect(notificationService.notifyAuthorOnBatchedComments).toHaveBeenCalledWith(
      mockPR,
      "commenter-uuid",
      "Commenter Name",
      5
    );
    expect(notificationService.notifyAuthorOnComment).not.toHaveBeenCalled();
  });

  it("should reset timer on each new comment", async () => {
    debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter Name");

    await vi.advanceTimersByTimeAsync(8_000);
    expect(notificationService.notifyAuthorOnComment).not.toHaveBeenCalled();

    debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter Name");

    await vi.advanceTimersByTimeAsync(8_000);
    expect(notificationService.notifyAuthorOnComment).not.toHaveBeenCalled();
    expect(notificationService.notifyAuthorOnBatchedComments).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(notificationService.notifyAuthorOnBatchedComments).toHaveBeenCalledOnce();
    expect(notificationService.notifyAuthorOnBatchedComments).toHaveBeenCalledWith(
      mockPR,
      "commenter-uuid",
      "Commenter Name",
      2
    );
  });

  it("should handle different commenters on same PR separately", async () => {
    debouncer.bufferComment(mockPR, "user-a", "User A");
    debouncer.bufferComment(mockPR, "user-b", "User B");

    await vi.advanceTimersByTimeAsync(10_000);

    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledTimes(2);
    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledWith(mockPR, "user-a", "User A");
    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledWith(mockPR, "user-b", "User B");
  });

  it("should handle same commenter on different PRs separately", async () => {
    const mockPR2 = createMockPR("pr-2");

    debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter");
    debouncer.bufferComment(mockPR2, "commenter-uuid", "Commenter");

    await vi.advanceTimersByTimeAsync(10_000);

    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledTimes(2);
    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledWith(mockPR, "commenter-uuid", "Commenter");
    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledWith(mockPR2, "commenter-uuid", "Commenter");
  });

  it("should handle mixed single and batch scenario", async () => {
    debouncer.bufferComment(mockPR, "user-a", "User A");

    for (let i = 0; i < 5; i++) {
      debouncer.bufferComment(mockPR, "user-b", "User B");
    }

    await vi.advanceTimersByTimeAsync(10_000);

    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledOnce();
    expect(notificationService.notifyAuthorOnComment).toHaveBeenCalledWith(mockPR, "user-a", "User A");
    expect(notificationService.notifyAuthorOnBatchedComments).toHaveBeenCalledOnce();
    expect(notificationService.notifyAuthorOnBatchedComments).toHaveBeenCalledWith(
      mockPR,
      "user-b",
      "User B",
      5
    );
  });

  it("should clean up buffer after flush", async () => {
    debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter");
    expect(debouncer.pendingCount).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(debouncer.pendingCount).toBe(0);
  });

  it("should use batched notification for exactly 2 comments", async () => {
    debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter");
    debouncer.bufferComment(mockPR, "commenter-uuid", "Commenter");

    await vi.advanceTimersByTimeAsync(10_000);

    expect(notificationService.notifyAuthorOnBatchedComments).toHaveBeenCalledWith(
      mockPR,
      "commenter-uuid",
      "Commenter",
      2
    );
    expect(notificationService.notifyAuthorOnComment).not.toHaveBeenCalled();
  });
});
