import { describe, it, expect } from "vitest";
import {
  deriveReviewerState,
  derivePRState,
  comparePRState,
  isAwaitingAction,
  isStale,
  formatAge,
  initials,
  type ReviewEvent,
} from "../src/utils/review-state.js";

const at = (iso: string): Date => new Date(iso);

function approval(actorId: string, iso: string): ReviewEvent {
  return { eventType: "PR_APPROVED", actorId, createdAt: at(iso) };
}

function changesRequested(actorId: string, iso: string): ReviewEvent {
  return { eventType: "PR_CHANGES_REQUESTED", actorId, createdAt: at(iso) };
}

function push(actorId: string, iso: string): ReviewEvent {
  return { eventType: "PR_COMMITS_PUSHED", actorId, createdAt: at(iso) };
}

function update(actorId: string, iso: string): ReviewEvent {
  return { eventType: "PR_UPDATED", actorId, createdAt: at(iso) };
}

describe("deriveReviewerState", () => {
  it("treats a pending reviewer with no history as awaiting a first review", () => {
    expect(deriveReviewerState("PENDING", "user-1", [])).toBe("AWAITING_FIRST_REVIEW");
  });

  it("keeps a verdict that nothing has invalidated", () => {
    const events = [approval("user-1", "2026-08-01T10:00:00Z")];
    expect(deriveReviewerState("APPROVED", "user-1", events)).toBe("APPROVED");
    expect(
      deriveReviewerState("CHANGES_REQUESTED", "user-1", [
        changesRequested("user-1", "2026-08-01T10:00:00Z"),
      ])
    ).toBe("CHANGES_REQUESTED");
  });

  it("stales out changes requested once the author pushes", () => {
    const events = [
      changesRequested("user-1", "2026-08-01T10:00:00Z"),
      push("author", "2026-08-02T10:00:00Z"),
    ];
    expect(deriveReviewerState("CHANGES_REQUESTED", "user-1", events)).toBe(
      "AWAITING_RE_REVIEW"
    );
  });

  it("keeps an approval even after the author pushes", () => {
    const events = [
      approval("user-1", "2026-08-01T10:00:00Z"),
      push("author", "2026-08-02T10:00:00Z"),
    ];
    expect(deriveReviewerState("APPROVED", "user-1", events)).toBe("APPROVED");
  });

  it("keeps an approval across repeated pushes", () => {
    const events = [
      approval("user-1", "2026-08-01T10:00:00Z"),
      push("author", "2026-08-02T10:00:00Z"),
      push("author", "2026-08-03T10:00:00Z"),
      push("author", "2026-08-04T10:00:00Z"),
    ];
    expect(deriveReviewerState("APPROVED", "user-1", events)).toBe("APPROVED");
  });

  it("keeps an approval that superseded the reviewer's own changes requested", () => {
    const events = [
      changesRequested("user-1", "2026-08-01T10:00:00Z"),
      approval("user-1", "2026-08-02T10:00:00Z"),
      push("author", "2026-08-03T10:00:00Z"),
    ];
    expect(deriveReviewerState("APPROVED", "user-1", events)).toBe("APPROVED");
  });

  it("keeps a verdict given after the last push", () => {
    const events = [
      push("author", "2026-08-01T10:00:00Z"),
      approval("user-1", "2026-08-02T10:00:00Z"),
    ];
    expect(deriveReviewerState("APPROVED", "user-1", events)).toBe("APPROVED");
  });

  it("uses the reviewer's latest verdict, not their first", () => {
    const events = [
      changesRequested("user-1", "2026-08-01T10:00:00Z"),
      push("author", "2026-08-02T10:00:00Z"),
      approval("user-1", "2026-08-03T10:00:00Z"),
    ];
    expect(deriveReviewerState("APPROVED", "user-1", events)).toBe("APPROVED");
  });

  it("does not treat a description edit as a push", () => {
    const events = [
      changesRequested("user-1", "2026-08-01T10:00:00Z"),
      update("author", "2026-08-02T10:00:00Z"),
    ];
    expect(deriveReviewerState("CHANGES_REQUESTED", "user-1", events)).toBe(
      "CHANGES_REQUESTED"
    );
  });

  it("ignores pushes that predate the reviewer's verdict", () => {
    const events = [
      push("author", "2026-08-01T10:00:00Z"),
      push("author", "2026-08-02T10:00:00Z"),
      changesRequested("user-1", "2026-08-03T10:00:00Z"),
    ];
    expect(deriveReviewerState("CHANGES_REQUESTED", "user-1", events)).toBe(
      "CHANGES_REQUESTED"
    );
  });

  it("stales out changes requested when any later push exists", () => {
    const events = [
      changesRequested("user-1", "2026-08-02T10:00:00Z"),
      push("author", "2026-08-01T10:00:00Z"),
      push("author", "2026-08-03T10:00:00Z"),
    ];
    expect(deriveReviewerState("CHANGES_REQUESTED", "user-1", events)).toBe(
      "AWAITING_RE_REVIEW"
    );
  });

  it("treats a withdrawn approval as awaiting a re-review", () => {
    const events = [approval("user-1", "2026-08-01T10:00:00Z")];
    expect(deriveReviewerState("PENDING", "user-1", events)).toBe("AWAITING_RE_REVIEW");
  });

  it("ignores verdicts made by other reviewers", () => {
    const events = [
      approval("user-2", "2026-08-01T10:00:00Z"),
      push("author", "2026-08-02T10:00:00Z"),
    ];
    expect(deriveReviewerState("PENDING", "user-1", events)).toBe("AWAITING_FIRST_REVIEW");
  });

  it("falls back to the bitbucket status when no verdict was ever logged", () => {
    expect(deriveReviewerState("CHANGES_REQUESTED", "user-1", [])).toBe(
      "CHANGES_REQUESTED"
    );
    expect(deriveReviewerState("APPROVED", "user-1", [])).toBe("APPROVED");
  });
});

describe("derivePRState", () => {
  it("reports no reviewers when nobody is assigned", () => {
    expect(derivePRState([])).toBe("NO_REVIEWERS");
  });

  it("ranks changes requested above every other state", () => {
    expect(derivePRState(["APPROVED", "AWAITING_RE_REVIEW", "CHANGES_REQUESTED"])).toBe("BLOCKED");
  });

  it("ranks a re-review above a first review", () => {
    expect(derivePRState(["AWAITING_FIRST_REVIEW", "AWAITING_RE_REVIEW"])).toBe("AWAITING_RE_REVIEW");
  });

  it("reports awaiting first review when only first reviews are outstanding", () => {
    expect(derivePRState(["APPROVED", "AWAITING_FIRST_REVIEW"])).toBe("AWAITING_FIRST_REVIEW");
  });

  it("reports ready to merge only when every reviewer approved", () => {
    expect(derivePRState(["APPROVED", "APPROVED"])).toBe("READY_TO_MERGE");
  });
});

describe("comparePRState", () => {
  it("sorts blocked ahead of ready to merge", () => {
    expect(comparePRState("BLOCKED", "READY_TO_MERGE")).toBeLessThan(0);
  });

  it("treats identical states as equal", () => {
    expect(comparePRState("BLOCKED", "BLOCKED")).toBe(0);
  });
});

describe("isAwaitingAction", () => {
  it("counts both waiting states as needing action", () => {
    expect(isAwaitingAction("AWAITING_FIRST_REVIEW")).toBe(true);
    expect(isAwaitingAction("AWAITING_RE_REVIEW")).toBe(true);
  });

  it("does not count resolved states", () => {
    expect(isAwaitingAction("APPROVED")).toBe(false);
    expect(isAwaitingAction("CHANGES_REQUESTED")).toBe(false);
  });
});

describe("isStale", () => {
  const now = at("2026-08-20T12:00:00Z");

  it("marks activity older than the threshold as stale", () => {
    expect(isStale(at("2026-08-16T12:00:00Z"), now, 3)).toBe(true);
  });

  it("leaves recent activity alone", () => {
    expect(isStale(at("2026-08-19T12:00:00Z"), now, 3)).toBe(false);
  });

  it("treats the threshold boundary as stale", () => {
    expect(isStale(at("2026-08-17T12:00:00Z"), now, 3)).toBe(true);
  });
});

describe("formatAge", () => {
  it("formats days with hours", () => {
    expect(formatAge(6 * 86400000 + 2 * 3600000)).toBe("6d 2h");
  });

  it("drops the hour part on a whole number of days", () => {
    expect(formatAge(2 * 86400000)).toBe("2d");
  });

  it("formats hours alone", () => {
    expect(formatAge(4 * 3600000)).toBe("4h");
  });

  it("falls back to minutes", () => {
    expect(formatAge(12 * 60000)).toBe("12m");
  });

  it("clamps negative durations", () => {
    expect(formatAge(-5000)).toBe("0m");
  });
});

describe("initials", () => {
  it("uses first and last name", () => {
    expect(initials("Emma Senior Dev")).toBe("ED");
  });

  it("handles a single name", () => {
    expect(initials("Prisma")).toBe("PR");
  });

  it("handles empty input", () => {
    expect(initials("   ")).toBe("??");
  });
});
