import type { EventType } from "@prisma/client";

export function describeActivity(
  eventType: EventType,
  actorName: string,
  authorName: string,
  actorIsAuthor: boolean
): string {
  switch (eventType) {
    case "PR_CREATED":
      return `${actorName} opened a new PR`;
    case "PR_APPROVED":
      return actorIsAuthor
        ? `${actorName} approved their own PR`
        : `${actorName} approved ${authorName}'s PR`;
    case "PR_CHANGES_REQUESTED":
      return actorIsAuthor
        ? `${actorName} requested changes on their own PR`
        : `${actorName} requested changes on ${authorName}'s PR`;
    case "PR_COMMENT_ADDED":
      return actorIsAuthor
        ? `${actorName} commented on their PR`
        : `${actorName} commented on ${authorName}'s PR`;
    case "PR_COMMITS_PUSHED":
      return actorIsAuthor
        ? `${actorName} pushed new commits`
        : `${actorName} pushed new commits to ${authorName}'s PR`;
    case "PR_UPDATED":
      return `${actorName} updated the PR details`;
    case "PR_MERGED":
      return `${actorName} merged the PR`;
    case "PR_DECLINED":
      return `${actorName} declined the PR`;
    case "PR_RE_REVIEW_REQUESTED":
      return actorIsAuthor
        ? `${authorName} asked to re-review their own PR`
        : `${authorName} asked ${actorName} to re-review`;
    case "PR_RE_REVIEWED":
      return `${actorName} re-reviewed the PR`;
    case "PR_AI_REVIEW_REQUESTED":
      return actorIsAuthor
        ? `${actorName} requested an AI review`
        : `${actorName} requested an AI review of ${authorName}'s PR`;
    case "PR_AI_REVIEW_COMPLETED":
      return `An AI review was posted on ${authorName}'s PR`;
    case "PR_AI_REVIEW_FAILED":
      return `The AI review of ${authorName}'s PR failed`;
  }
}

export const ACTIVITY_EVENT_TOKENS: Record<EventType, string> = {
  PR_CREATED: "wait",
  PR_UPDATED: "muted",
  PR_COMMITS_PUSHED: "rere",
  PR_APPROVED: "ok",
  PR_CHANGES_REQUESTED: "stop",
  PR_COMMENT_ADDED: "muted",
  PR_MERGED: "ok",
  PR_DECLINED: "stop",
  PR_RE_REVIEW_REQUESTED: "rere",
  PR_RE_REVIEWED: "ok",
  PR_AI_REVIEW_REQUESTED: "rere",
  PR_AI_REVIEW_COMPLETED: "ok",
  PR_AI_REVIEW_FAILED: "stop",
};

export function clampLimit(raw: unknown, fallback = 10, max = 100): number {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}
