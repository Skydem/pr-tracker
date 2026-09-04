import type { AiReview } from "@prisma/client";
import { prisma } from "../db/client.js";
import { config } from "../config/env.js";
import { prService } from "./pr.service.js";
import { notificationService } from "./notification.service.js";
import {
  AI_REVIEW_MODEL,
  ClaudeReviewRunner,
  type ReviewRunner,
  type ReviewRunResult,
} from "./ai-review-runner.js";

export type AiReviewRequestFailure =
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "NOT_AUTHOR"
  | "ALREADY_REVIEWED"
  | "IN_PROGRESS";

export type RequestAiReviewResult =
  | { ok: true; reviewId: string }
  | { ok: false; reason: AiReviewRequestFailure };

const UNIQUE_VIOLATION = "P2002";

export class AiReviewService {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly runner: ReviewRunner = new ClaudeReviewRunner()) {}

  isEnabled(): boolean {
    return config.aiReview.repoPath !== "";
  }

  async request(pullRequestId: string, requesterId: string): Promise<RequestAiReviewResult> {
    if (!this.isEnabled()) return { ok: false, reason: "NOT_CONFIGURED" };

    const pr = await prisma.pullRequest.findUnique({
      where: { id: pullRequestId },
      include: { aiReview: true },
    });

    if (!pr || pr.state !== "OPEN") return { ok: false, reason: "NOT_FOUND" };
    if (pr.authorId !== requesterId) return { ok: false, reason: "NOT_AUTHOR" };

    const existing = pr.aiReview;
    if (existing?.status === "COMPLETED") return { ok: false, reason: "ALREADY_REVIEWED" };
    if (existing && existing.status !== "FAILED") return { ok: false, reason: "IN_PROGRESS" };

    const review = existing
      ? await this.requeueFailed(existing, requesterId)
      : await this.createQueued(pullRequestId, requesterId);

    if (review === null) return { ok: false, reason: "IN_PROGRESS" };

    await prisma.pREvent.create({
      data: {
        pullRequestId,
        eventType: "PR_AI_REVIEW_REQUESTED",
        actorId: requesterId,
        payload: { reviewId: review.id, retry: existing !== null },
      },
    });

    this.enqueue(review.id);

    return { ok: true, reviewId: review.id };
  }

  async recoverInterrupted(): Promise<number> {
    const result = await prisma.aiReview.updateMany({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "FAILED",
        error: "Interrupted by an app restart",
        finishedAt: new Date(),
      },
    });

    return result.count;
  }

  idle(): Promise<void> {
    return this.queue;
  }

  private enqueue(reviewId: string): void {
    this.queue = this.queue
      .then(() => this.run(reviewId))
      .catch((error) => {
        console.error(`[AiReview] Unhandled failure while running review ${reviewId}:`, error);
      });
  }

  private async run(reviewId: string): Promise<void> {
    const review = await prisma.aiReview.findUnique({
      where: { id: reviewId },
      include: { pullRequest: true },
    });

    if (!review || review.status !== "QUEUED") return;

    await prisma.aiReview.update({
      where: { id: reviewId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    console.log(
      `[AiReview] Reviewing ${review.pullRequest.workspaceSlug}/${review.pullRequest.repositorySlug}#${review.pullRequest.bitbucketId}`
    );

    const result = await this.runner.run({
      workspaceSlug: review.pullRequest.workspaceSlug,
      repositorySlug: review.pullRequest.repositorySlug,
      bitbucketId: review.pullRequest.bitbucketId,
    });

    await this.finish(review, result);
  }

  private async finish(
    review: AiReview & { pullRequest: { id: string } },
    result: ReviewRunResult
  ): Promise<void> {
    const finishedAt = new Date();

    await prisma.aiReview.update({
      where: { id: review.id },
      data: result.ok
        ? { status: "COMPLETED", summary: result.summary, error: null, costUsd: result.costUsd, finishedAt }
        : { status: "FAILED", summary: result.summary, error: result.error, finishedAt },
    });

    await prisma.pREvent.create({
      data: {
        pullRequestId: review.pullRequestId,
        eventType: result.ok ? "PR_AI_REVIEW_COMPLETED" : "PR_AI_REVIEW_FAILED",
        actorId: review.requestedById,
        payload: result.ok
          ? { reviewId: review.id, costUsd: result.costUsd, turns: result.turns }
          : { reviewId: review.id, error: result.error },
      },
    });

    if (result.ok) {
      console.log(`[AiReview] Review ${review.id} completed (cost ${result.costUsd ?? "?"} USD)`);
    } else {
      console.error(`[AiReview] Review ${review.id} failed: ${result.error}`);
    }

    const pr = await prService.getPRWithReviewers(review.pullRequestId).catch(() => null);
    if (pr) {
      await notificationService.notifyAuthorOnAiReviewFinished(
        pr,
        result.ok ? { ok: true } : { ok: false, error: result.error }
      );
    }
  }

  private async createQueued(pullRequestId: string, requesterId: string): Promise<{ id: string } | null> {
    try {
      return await prisma.aiReview.create({
        data: { pullRequestId, requestedById: requesterId, model: AI_REVIEW_MODEL },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  private async requeueFailed(existing: AiReview, requesterId: string): Promise<{ id: string } | null> {
    const result = await prisma.aiReview.updateMany({
      where: { id: existing.id, status: "FAILED" },
      data: {
        status: "QUEUED",
        requestedById: requesterId,
        model: AI_REVIEW_MODEL,
        summary: null,
        error: null,
        costUsd: null,
        startedAt: null,
        finishedAt: null,
      },
    });

    return result.count === 1 ? { id: existing.id } : null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export const aiReviewService = new AiReviewService();
