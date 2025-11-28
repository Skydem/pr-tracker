import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import crypto from "crypto";
import { config } from "../config/env.js";
import { prService } from "../services/pr.service.js";
import { userService } from "../services/user.service.js";
import { notificationService } from "../services/notification.service.js";
import type {
  BitbucketWebhookPayload,
  BitbucketApprovalPayload,
  BitbucketChangesRequestPayload,
  BitbucketCommentPayload,
  BitbucketEventType,
} from "../types/bitbucket.types.js";

function verifyWebhookSignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!config.webhookSecret) return true;
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export function createBitbucketWebhookRouter(): Router {
  const router = createRouter();

  router.post("/", async (req: Request, res: Response) => {
    const signature = req.headers["x-hub-signature"] as string | undefined;
    const eventType = req.headers["x-event-key"] as BitbucketEventType;
    const rawBody = JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    try {
      await handleWebhookEvent(eventType, req.body);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Webhook handler error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

async function handleWebhookEvent(
  eventType: BitbucketEventType,
  payload: unknown
): Promise<void> {
  console.log(`Received webhook event: ${eventType}`);

  switch (eventType) {
    case "pullrequest:created":
      await handlePRCreated(payload as BitbucketWebhookPayload);
      break;
    case "pullrequest:updated":
      await handlePRUpdated(payload as BitbucketWebhookPayload);
      break;
    case "pullrequest:approved":
      await handlePRApproved(payload as BitbucketApprovalPayload);
      break;
    case "pullrequest:changes_request_created":
      await handleChangesRequested(payload as BitbucketChangesRequestPayload);
      break;
    case "pullrequest:comment_created":
      await handleCommentCreated(payload as BitbucketCommentPayload);
      break;
    case "pullrequest:fulfilled":
      await handlePRMerged(payload as BitbucketWebhookPayload);
      break;
    case "pullrequest:rejected":
      await handlePRDeclined(payload as BitbucketWebhookPayload);
      break;
    default:
      console.log(`Unhandled event type: ${eventType}`);
  }
}

async function handlePRCreated(payload: BitbucketWebhookPayload): Promise<void> {
  const workspaceSlug = payload.repository.workspace.slug;

  await userService.findOrCreateUser(
    payload.actor.uuid,
    null,
    payload.actor.display_name
  );

  const pr = await prService.createOrUpdatePR(payload.pullrequest, workspaceSlug);

  await prService.logEvent(pr.id, "PR_CREATED", payload.actor.uuid, {
    title: payload.pullrequest.title,
    reviewers: payload.pullrequest.reviewers.map((r) => r.display_name),
  });

  await notificationService.notifyReviewersOnPRCreated(pr);
}

async function handlePRUpdated(payload: BitbucketWebhookPayload): Promise<void> {
  const workspaceSlug = payload.repository.workspace.slug;

  const pr = await prService.createOrUpdatePR(payload.pullrequest, workspaceSlug);

  await prService.logEvent(pr.id, "PR_UPDATED", payload.actor.uuid);

  await notificationService.notifyReviewersOnPRUpdated(pr);
}

async function handlePRApproved(payload: BitbucketApprovalPayload): Promise<void> {
  const workspaceSlug = payload.repository.workspace.slug;

  const pr = await prService.getPRByBitbucketId(
    payload.pullrequest.id,
    payload.pullrequest.destination.repository.name,
    workspaceSlug
  );

  if (!pr) {
    console.log("PR not found, creating...");
    const newPr = await prService.createOrUpdatePR(
      payload.pullrequest,
      workspaceSlug
    );
    await handleApprovalForPR(newPr, payload);
    return;
  }

  await handleApprovalForPR(pr, payload);
}

async function handleApprovalForPR(
  pr: Awaited<ReturnType<typeof prService.getPRWithReviewers>>,
  payload: BitbucketApprovalPayload
): Promise<void> {
  await prService.updateReviewerStatus(
    pr.id,
    payload.approval.user.uuid,
    "APPROVED"
  );

  await prService.logEvent(pr.id, "PR_APPROVED", payload.actor.uuid, {
    approver: payload.approval.user.display_name,
  });

  const updatedPR = await prService.getPRWithReviewers(pr.id);
  await notificationService.notifyAuthorOnAllApproved(updatedPR);
}

async function handleChangesRequested(
  payload: BitbucketChangesRequestPayload
): Promise<void> {
  const workspaceSlug = payload.repository.workspace.slug;

  let pr = await prService.getPRByBitbucketId(
    payload.pullrequest.id,
    payload.pullrequest.destination.repository.name,
    workspaceSlug
  );

  if (!pr) {
    pr = await prService.createOrUpdatePR(payload.pullrequest, workspaceSlug);
  }

  await prService.updateReviewerStatus(
    pr.id,
    payload.changes_request.user.uuid,
    "CHANGES_REQUESTED"
  );

  await prService.logEvent(pr.id, "PR_CHANGES_REQUESTED", payload.actor.uuid, {
    reviewer: payload.changes_request.user.display_name,
  });

  const updatedPR = await prService.getPRWithReviewers(pr.id);
  await notificationService.notifyAuthorOnChangesRequested(
    updatedPR,
    payload.changes_request.user.display_name
  );
}

async function handleCommentCreated(payload: BitbucketCommentPayload): Promise<void> {
  const workspaceSlug = payload.repository.workspace.slug;

  let pr = await prService.getPRByBitbucketId(
    payload.pullrequest.id,
    payload.pullrequest.destination.repository.name,
    workspaceSlug
  );

  if (!pr) {
    pr = await prService.createOrUpdatePR(payload.pullrequest, workspaceSlug);
  }

  await prService.logEvent(pr.id, "PR_COMMENT_ADDED", payload.actor.uuid, {
    commenter: payload.comment.user.display_name,
  });

  await notificationService.notifyAuthorOnComment(
    pr,
    payload.comment.user.uuid,
    payload.comment.user.display_name
  );
}

async function handlePRMerged(payload: BitbucketWebhookPayload): Promise<void> {
  const workspaceSlug = payload.repository.workspace.slug;

  let pr = await prService.getPRByBitbucketId(
    payload.pullrequest.id,
    payload.pullrequest.destination.repository.name,
    workspaceSlug
  );

  if (!pr) {
    pr = await prService.createOrUpdatePR(payload.pullrequest, workspaceSlug);
  }

  await prService.updatePRState(pr.id, "MERGED");

  await prService.logEvent(pr.id, "PR_MERGED", payload.actor.uuid);
}

async function handlePRDeclined(payload: BitbucketWebhookPayload): Promise<void> {
  const workspaceSlug = payload.repository.workspace.slug;

  let pr = await prService.getPRByBitbucketId(
    payload.pullrequest.id,
    payload.pullrequest.destination.repository.name,
    workspaceSlug
  );

  if (!pr) {
    pr = await prService.createOrUpdatePR(payload.pullrequest, workspaceSlug);
  }

  await prService.updatePRState(pr.id, "DECLINED");

  await prService.logEvent(pr.id, "PR_DECLINED", payload.actor.uuid);
}
