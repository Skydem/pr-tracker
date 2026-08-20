import type { EventType, ReviewStatus } from "@prisma/client";

export type ReviewerState =
  | "AWAITING_FIRST_REVIEW"
  | "AWAITING_RE_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED";

export type PRHeadlineState =
  | "BLOCKED"
  | "AWAITING_RE_REVIEW"
  | "AWAITING_FIRST_REVIEW"
  | "READY_TO_MERGE"
  | "NO_REVIEWERS";

export interface ReviewEvent {
  eventType: EventType;
  actorId: string;
  createdAt: Date;
}

export const REVIEWER_STATE_LABELS: Record<ReviewerState, string> = {
  AWAITING_FIRST_REVIEW: "Awaiting first review",
  AWAITING_RE_REVIEW: "Awaiting re-review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
};

export const PR_STATE_LABELS: Record<PRHeadlineState, string> = {
  BLOCKED: "Changes requested",
  AWAITING_RE_REVIEW: "Awaiting re-review",
  AWAITING_FIRST_REVIEW: "Awaiting first review",
  READY_TO_MERGE: "Ready to merge",
  NO_REVIEWERS: "No reviewers",
};

const PR_STATE_ORDER: PRHeadlineState[] = [
  "BLOCKED",
  "AWAITING_RE_REVIEW",
  "AWAITING_FIRST_REVIEW",
  "READY_TO_MERGE",
  "NO_REVIEWERS",
];

export function deriveReviewerState(
  status: ReviewStatus,
  userId: string,
  events: ReviewEvent[]
): ReviewerState {
  if (status === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  if (status === "APPROVED") return "APPROVED";

  const approvedEarlier = events.some(
    (event) => event.eventType === "PR_APPROVED" && event.actorId === userId
  );

  return approvedEarlier ? "AWAITING_RE_REVIEW" : "AWAITING_FIRST_REVIEW";
}

export function derivePRState(reviewerStates: ReviewerState[]): PRHeadlineState {
  if (reviewerStates.length === 0) return "NO_REVIEWERS";
  if (reviewerStates.includes("CHANGES_REQUESTED")) return "BLOCKED";
  if (reviewerStates.includes("AWAITING_RE_REVIEW")) return "AWAITING_RE_REVIEW";
  if (reviewerStates.includes("AWAITING_FIRST_REVIEW")) return "AWAITING_FIRST_REVIEW";
  return "READY_TO_MERGE";
}

export function comparePRState(a: PRHeadlineState, b: PRHeadlineState): number {
  return PR_STATE_ORDER.indexOf(a) - PR_STATE_ORDER.indexOf(b);
}

export function isAwaitingAction(state: ReviewerState): boolean {
  return state === "AWAITING_FIRST_REVIEW" || state === "AWAITING_RE_REVIEW";
}

export function isStale(lastActivityAt: Date, now: Date, thresholdDays: number): boolean {
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  return now.getTime() - lastActivityAt.getTime() >= thresholdMs;
}

export function formatAge(milliseconds: number): string {
  if (milliseconds < 0) return "0m";

  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
