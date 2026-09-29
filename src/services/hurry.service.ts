import { prisma } from "../db/client.js";
import { dashboardService, type HurryTarget } from "./dashboard.service.js";

export type HurryFailure = "NOT_FOUND" | "IS_TARGET" | "NOT_HURRYABLE" | "COOLING_DOWN";

export type HurryResult =
  | { ok: true; count: number; target: HurryTarget; targetIds: string[] }
  | { ok: false; reason: HurryFailure };

export class HurryService {
  async hurry(pullRequestId: string, hurrierId: string, now: Date = new Date()): Promise<HurryResult> {
    const pr = await dashboardService.getPullRequest(pullRequestId, now);

    if (!pr) return { ok: false, reason: "NOT_FOUND" };

    const { target, targetIds } = pr.hurry;

    if (!pr.hurry.eligible || target === null || targetIds.length === 0) {
      return { ok: false, reason: "NOT_HURRYABLE" };
    }
    if (targetIds.includes(hurrierId)) return { ok: false, reason: "IS_TARGET" };
    if (pr.hurry.coolingDownUserIds.includes(hurrierId)) return { ok: false, reason: "COOLING_DOWN" };

    await prisma.pREvent.create({
      data: {
        pullRequestId,
        eventType: target === "AUTHOR" ? "PR_HURRIED" : "PR_REVIEWERS_HURRIED",
        actorId: hurrierId,
        createdAt: now,
      },
    });

    return { ok: true, count: pr.hurry.count + 1, target, targetIds };
  }
}

export const hurryService = new HurryService();
