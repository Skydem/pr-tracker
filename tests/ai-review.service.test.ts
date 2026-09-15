import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/env.js", () => ({
  config: {
    aiReview: {
      repoPath: "/srv/shiplink",
      repositorySlug: "backend",
      pluginPath: "",
      command: "/code-review-bitbucket:code-review",
      claudeBin: "claude",
      bitbucketMcpCommand: "mcp-atlassian-bitbucket",
      timeoutMinutes: 30,
      bitbucketEmail: "reviewer@acme.test",
      bitbucketApiToken: "review-token-456",
    },
    bitbucket: { workspace: "acme", email: "", apiToken: "", repos: [] },
  },
}));

vi.mock("../src/services/notification.service.js", () => ({
  notificationService: { notifyAuthorOnAiReviewFinished: vi.fn() },
}));

import { prisma } from "../src/db/client.js";
import { config } from "../src/config/env.js";
import { notificationService } from "../src/services/notification.service.js";
import { AiReviewService } from "../src/services/ai-review.service.js";
import type { ReviewRunner, ReviewRunResult } from "../src/services/ai-review-runner.js";

const author = "u-author";
const other = "u-other";

const openPR = {
  id: "pr-1",
  state: "OPEN",
  authorId: author,
  workspaceSlug: "acme",
  repositorySlug: "backend",
  bitbucketId: 482,
  aiReview: null,
};

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "rev-1",
    pullRequestId: "pr-1",
    requestedById: author,
    status: "QUEUED",
    model: "sonnet",
    summary: null,
    error: null,
    costUsd: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function runnerReturning(result: ReviewRunResult): ReviewRunner & { run: ReturnType<typeof vi.fn> } {
  return { run: vi.fn().mockResolvedValue(result) };
}

describe("AiReviewService.request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.aiReview.repoPath = "/srv/shiplink";
  });

  it("refuses when the feature is not configured", async () => {
    config.aiReview.repoPath = "";
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));

    expect(await service.request("pr-1", author)).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(prisma.pullRequest.findUnique).not.toHaveBeenCalled();
  });

  it("refuses pull requests from a repo the feature isn't scoped to", async () => {
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));
    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue({
      ...openPR,
      repositorySlug: "shiplink-backend",
    } as never);

    expect(await service.request("pr-1", author)).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(prisma.aiReview.create).not.toHaveBeenCalled();
  });

  it("matches the configured repo slug case-insensitively", async () => {
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));
    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue({
      ...openPR,
      repositorySlug: "Backend",
    } as never);
    vi.mocked(prisma.aiReview.create).mockResolvedValue({ id: "rev-1" } as never);

    expect(await service.request("pr-1", author)).toEqual({ ok: true, reviewId: "rev-1" });
  });

  it("refuses unknown and closed pull requests", async () => {
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));

    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValueOnce(null);
    expect(await service.request("pr-x", author)).toEqual({ ok: false, reason: "NOT_FOUND" });

    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValueOnce({ ...openPR, state: "MERGED" } as never);
    expect(await service.request("pr-1", author)).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("only lets the author ask", async () => {
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));
    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue(openPR as never);

    expect(await service.request("pr-1", other)).toEqual({ ok: false, reason: "NOT_AUTHOR" });
    expect(prisma.aiReview.create).not.toHaveBeenCalled();
  });

  it("allows exactly one completed review per pull request", async () => {
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));
    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue({
      ...openPR,
      aiReview: review({ status: "COMPLETED" }),
    } as never);

    expect(await service.request("pr-1", author)).toEqual({ ok: false, reason: "ALREADY_REVIEWED" });
    expect(prisma.aiReview.create).not.toHaveBeenCalled();
    expect(prisma.aiReview.updateMany).not.toHaveBeenCalled();
  });

  it("does not start a second run while one is queued or running", async () => {
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));

    for (const status of ["QUEUED", "RUNNING"]) {
      vi.mocked(prisma.pullRequest.findUnique).mockResolvedValueOnce({ ...openPR, aiReview: review({ status }) } as never);
      expect(await service.request("pr-1", author)).toEqual({ ok: false, reason: "IN_PROGRESS" });
    }
  });

  it("treats a concurrent create as an in-progress review", async () => {
    const service = new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null }));
    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue(openPR as never);
    vi.mocked(prisma.aiReview.create).mockRejectedValue({ code: "P2002" });

    expect(await service.request("pr-1", author)).toEqual({ ok: false, reason: "IN_PROGRESS" });
    expect(prisma.pREvent.create).not.toHaveBeenCalled();
  });

  it("queues, runs on the runner, records completion, logs events and notifies the author", async () => {
    const runner = runnerReturning({ ok: true, summary: "### Code review\n\nFound 2 issues.", costUsd: 3.5, turns: 80, sessionId: "s" });
    const service = new AiReviewService(runner);
    const prWithReviewers = { id: "pr-1", title: "Rate limiting", author: { slackUserId: "U1" }, reviewers: [] };

    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue(openPR as never);
    vi.mocked(prisma.aiReview.create).mockResolvedValue({ id: "rev-1" } as never);
    vi.mocked(prisma.aiReview.findUnique).mockResolvedValue({ ...review(), pullRequest: openPR } as never);
    vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockResolvedValue(prWithReviewers as never);

    expect(await service.request("pr-1", author)).toEqual({ ok: true, reviewId: "rev-1" });
    await service.idle();

    expect(prisma.aiReview.create).toHaveBeenCalledWith({
      data: { pullRequestId: "pr-1", requestedById: author, model: "sonnet" },
      select: { id: true },
    });
    expect(runner.run).toHaveBeenCalledWith({ workspaceSlug: "acme", repositorySlug: "backend", bitbucketId: 482 });

    const updates = vi.mocked(prisma.aiReview.update).mock.calls.map((call) => call[0].data);
    expect(updates[0]).toMatchObject({ status: "RUNNING" });
    expect(updates[1]).toMatchObject({ status: "COMPLETED", summary: "### Code review\n\nFound 2 issues.", costUsd: 3.5, error: null });

    const events = vi.mocked(prisma.pREvent.create).mock.calls.map((call) => call[0].data.eventType);
    expect(events).toEqual(["PR_AI_REVIEW_REQUESTED", "PR_AI_REVIEW_COMPLETED"]);

    expect(notificationService.notifyAuthorOnAiReviewFinished).toHaveBeenCalledWith(prWithReviewers, { ok: true });
  });

  it("records a failed run with its error and tells the author", async () => {
    const service = new AiReviewService(runnerReturning({ ok: false, error: "Timed out after 30 minutes", summary: null }));

    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue(openPR as never);
    vi.mocked(prisma.aiReview.create).mockResolvedValue({ id: "rev-1" } as never);
    vi.mocked(prisma.aiReview.findUnique).mockResolvedValue({ ...review(), pullRequest: openPR } as never);
    vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockResolvedValue({ id: "pr-1", author: { slackUserId: "U1" }, reviewers: [] } as never);

    await service.request("pr-1", author);
    await service.idle();

    const finalUpdate = vi.mocked(prisma.aiReview.update).mock.calls.at(-1)![0].data;
    expect(finalUpdate).toMatchObject({ status: "FAILED", error: "Timed out after 30 minutes" });

    const events = vi.mocked(prisma.pREvent.create).mock.calls.map((call) => call[0].data.eventType);
    expect(events).toEqual(["PR_AI_REVIEW_REQUESTED", "PR_AI_REVIEW_FAILED"]);
    expect(notificationService.notifyAuthorOnAiReviewFinished).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pr-1" }),
      { ok: false, error: "Timed out after 30 minutes" }
    );
  });

  it("lets the author retry after a failure by re-queuing the same row", async () => {
    const runner = runnerReturning({ ok: true, summary: "ok", costUsd: 1, turns: 1, sessionId: null });
    const service = new AiReviewService(runner);

    vi.mocked(prisma.pullRequest.findUnique).mockResolvedValue({
      ...openPR,
      aiReview: review({ status: "FAILED", error: "boom" }),
    } as never);
    vi.mocked(prisma.aiReview.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.aiReview.findUnique).mockResolvedValue({ ...review(), pullRequest: openPR } as never);
    vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockRejectedValue(new Error("gone"));

    expect(await service.request("pr-1", author)).toEqual({ ok: true, reviewId: "rev-1" });
    await service.idle();

    expect(prisma.aiReview.create).not.toHaveBeenCalled();
    expect(prisma.aiReview.updateMany).toHaveBeenCalledWith({
      where: { id: "rev-1", status: "FAILED" },
      data: expect.objectContaining({ status: "QUEUED", error: null, summary: null }),
    });
    expect(vi.mocked(prisma.pREvent.create).mock.calls[0]![0].data.payload).toEqual({ reviewId: "rev-1", retry: true });
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyAuthorOnAiReviewFinished).not.toHaveBeenCalled();
  });

  it("runs queued reviews one at a time", async () => {
    let release: () => void = () => {};
    const firstRun = new Promise<void>((resolve) => { release = resolve; });
    const runner: ReviewRunner & { run: ReturnType<typeof vi.fn> } = {
      run: vi
        .fn()
        .mockImplementationOnce(() => firstRun.then(() => ({ ok: true, summary: "a", costUsd: null, turns: null, sessionId: null })))
        .mockResolvedValueOnce({ ok: true, summary: "b", costUsd: null, turns: null, sessionId: null }),
    };
    const service = new AiReviewService(runner);

    vi.mocked(prisma.pullRequest.findUnique)
      .mockResolvedValueOnce(openPR as never)
      .mockResolvedValueOnce({ ...openPR, id: "pr-2", bitbucketId: 483 } as never);
    vi.mocked(prisma.aiReview.create)
      .mockResolvedValueOnce({ id: "rev-1" } as never)
      .mockResolvedValueOnce({ id: "rev-2" } as never);
    vi.mocked(prisma.aiReview.findUnique)
      .mockResolvedValueOnce({ ...review(), pullRequest: openPR } as never)
      .mockResolvedValueOnce({ ...review({ id: "rev-2", pullRequestId: "pr-2" }), pullRequest: { ...openPR, id: "pr-2", bitbucketId: 483 } } as never);
    vi.mocked(prisma.pullRequest.findUniqueOrThrow).mockRejectedValue(new Error("skip notify"));

    await service.request("pr-1", author);
    await service.request("pr-2", author);
    await new Promise((resolve) => setImmediate(resolve));

    expect(runner.run).toHaveBeenCalledTimes(1);
    release();
    await service.idle();
    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(runner.run.mock.calls[1]![0]).toMatchObject({ bitbucketId: 483 });
  });
});

describe("AiReviewService.recoverInterrupted", () => {
  it("fails reviews left queued or running by a restart so they can be retried", async () => {
    vi.mocked(prisma.aiReview.updateMany).mockResolvedValue({ count: 2 });

    const count = await new AiReviewService(runnerReturning({ ok: true, summary: "", costUsd: null, turns: null, sessionId: null })).recoverInterrupted();

    expect(count).toBe(2);
    expect(prisma.aiReview.updateMany).toHaveBeenCalledWith({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      data: expect.objectContaining({ status: "FAILED", error: "Interrupted by an app restart" }),
    });
  });
});
