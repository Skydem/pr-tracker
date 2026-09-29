import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/dashboard.service.js", () => ({
  dashboardService: {
    getPullRequest: vi.fn(),
  },
}));

import { prisma } from "../src/db/client.js";
import { dashboardService } from "../src/services/dashboard.service.js";
import { HurryService } from "../src/services/hurry.service.js";

const NOW = new Date("2026-08-20T12:00:00Z");

function boardPR(
  hurry: { count: number; eligible: boolean; coolingDownUserIds: string[] },
  target: "AUTHOR" | "REVIEWERS" = "AUTHOR"
) {
  const targetIds = target === "AUTHOR" ? ["u-author"] : ["u-reviewer", "u-other"];
  return { id: "pr-1", authorId: "u-author", hurry: { ...hurry, target, targetIds } };
}

describe("HurryService", () => {
  let service: HurryService;

  beforeEach(() => {
    service = new HurryService();
    vi.clearAllMocks();
  });

  it("logs a hurry and returns the new count", async () => {
    vi.mocked(dashboardService.getPullRequest).mockResolvedValue(
      boardPR({ count: 2, eligible: true, coolingDownUserIds: [] }) as never
    );

    const result = await service.hurry("pr-1", "u-reviewer", NOW);

    expect(result).toEqual({ ok: true, count: 3, target: "AUTHOR", targetIds: ["u-author"] });
    expect(prisma.pREvent.create).toHaveBeenCalledWith({
      data: { pullRequestId: "pr-1", eventType: "PR_HURRIED", actorId: "u-reviewer", createdAt: NOW },
    });
  });

  it("logs a reviewer hurry when the PR is waiting on reviews", async () => {
    vi.mocked(dashboardService.getPullRequest).mockResolvedValue(
      boardPR({ count: 0, eligible: true, coolingDownUserIds: [] }, "REVIEWERS") as never
    );

    const result = await service.hurry("pr-1", "u-author", NOW);

    expect(result).toEqual({ ok: true, count: 1, target: "REVIEWERS", targetIds: ["u-reviewer", "u-other"] });
    expect(prisma.pREvent.create).toHaveBeenCalledWith({
      data: { pullRequestId: "pr-1", eventType: "PR_REVIEWERS_HURRIED", actorId: "u-author", createdAt: NOW },
    });
  });

  it("does not let a reviewer who still owes a review hurry the reviewers", async () => {
    vi.mocked(dashboardService.getPullRequest).mockResolvedValue(
      boardPR({ count: 0, eligible: true, coolingDownUserIds: [] }, "REVIEWERS") as never
    );

    expect(await service.hurry("pr-1", "u-other", NOW)).toEqual({ ok: false, reason: "IS_TARGET" });
  });

  it("rejects a missing pull request", async () => {
    vi.mocked(dashboardService.getPullRequest).mockResolvedValue(null);

    expect(await service.hurry("pr-1", "u-reviewer", NOW)).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(prisma.pREvent.create).not.toHaveBeenCalled();
  });

  it("does not let the author hurry themselves", async () => {
    vi.mocked(dashboardService.getPullRequest).mockResolvedValue(
      boardPR({ count: 0, eligible: true, coolingDownUserIds: [] }) as never
    );

    expect(await service.hurry("pr-1", "u-author", NOW)).toEqual({ ok: false, reason: "IS_TARGET" });
  });

  it("rejects a pull request that is not hurryable", async () => {
    vi.mocked(dashboardService.getPullRequest).mockResolvedValue(
      boardPR({ count: 0, eligible: false, coolingDownUserIds: [] }) as never
    );

    expect(await service.hurry("pr-1", "u-reviewer", NOW)).toEqual({ ok: false, reason: "NOT_HURRYABLE" });
  });

  it("rejects a repeat hurry during the cooldown", async () => {
    vi.mocked(dashboardService.getPullRequest).mockResolvedValue(
      boardPR({ count: 1, eligible: true, coolingDownUserIds: ["u-reviewer"] }) as never
    );

    expect(await service.hurry("pr-1", "u-reviewer", NOW)).toEqual({ ok: false, reason: "COOLING_DOWN" });
    expect(prisma.pREvent.create).not.toHaveBeenCalled();
  });
});
