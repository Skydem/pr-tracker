import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import { prService } from "../services/pr.service.js";
import { notificationService } from "../services/notification.service.js";
import { requireViewer } from "../auth/session.js";
import { clampLimit } from "../utils/activity.js";
import {
  renderBoard,
  renderPersonBoard,
  renderActivity,
  renderNotFound,
} from "./dashboard.view.js";

const PERSON_ACTIVITY_PREVIEW_LIMIT = 10;

export function createDashboardRouter(): Router {
  const router = createRouter();

  router.get("/", async (req: Request, res: Response) => {
    const viewer = req.viewer ?? null;

    try {
      const personId = typeof req.query.person === "string" ? req.query.person : null;

      const board = await dashboardService.getBoard();

      if (personId === null) {
        res.type("html").send(renderBoard(board, viewer));
        return;
      }

      const person = await dashboardService.getPersonBoard(
        personId,
        board.generatedAt,
        board
      );

      if (person === null) {
        res.status(404).type("html").send(renderNotFound("That person is not in the tracker.", viewer));
        return;
      }

      const activity = await dashboardService.getActivity({
        limit: PERSON_ACTIVITY_PREVIEW_LIMIT,
        personId,
      });

      res.type("html").send(renderPersonBoard(person, board, activity, viewer));
    } catch (error) {
      console.error("[Dashboard] Failed to render:", error);
      res.status(500).type("html").send(renderNotFound("The dashboard could not be loaded.", viewer));
    }
  });

  router.get("/activity", async (req: Request, res: Response) => {
    const viewer = req.viewer ?? null;

    try {
      const personId = typeof req.query.person === "string" ? req.query.person : null;
      const limit = clampLimit(req.query.limit);

      const board = await dashboardService.getBoard();

      const person = personId !== null ? await dashboardService.getPersonRef(personId) : null;

      if (personId !== null && person === null) {
        res.status(404).type("html").send(renderNotFound("That person is not in the tracker.", viewer));
        return;
      }

      const activity = await dashboardService.getActivity({
        limit,
        personId: personId ?? undefined,
      });

      res.type("html").send(renderActivity(activity, board, person, viewer));
    } catch (error) {
      console.error("[Dashboard] Failed to render activity:", error);
      res.status(500).type("html").send(renderNotFound("The dashboard could not be loaded.", viewer));
    }
  });

  router.post("/pr/:prId/request-re-review", requireViewer, async (req: Request, res: Response) => {
    const viewer = req.viewer;

    if (!viewer || viewer.userId === null) {
      res.status(401).json({ error: "Sign in with Slack to do that" });
      return;
    }

    const body = req.body as { reviewerIds?: unknown };
    const reviewerIds = Array.isArray(body.reviewerIds)
      ? body.reviewerIds.filter((id): id is string => typeof id === "string")
      : [];

    const result = await prService.requestReReview(req.params.prId!, viewer.userId, reviewerIds);

    if (!result.ok) {
      res.status(reReviewErrorStatus(result.reason)).json({ error: reReviewErrorMessage(result.reason) });
      return;
    }

    const updatedPR = await prService.getPRWithReviewers(req.params.prId!).catch(() => null);
    if (updatedPR) {
      await notificationService.notifyReviewersOnReReviewRequested(
        updatedPR,
        result.requestedIds,
        viewer.displayName
      );
    }

    res.json({ ok: true, requested: result.requestedIds.length });
  });

  return router;
}

function reReviewErrorStatus(reason: "NOT_FOUND" | "NOT_AUTHOR" | "NO_REVIEWERS_SELECTED"): number {
  switch (reason) {
    case "NOT_FOUND":
      return 404;
    case "NOT_AUTHOR":
      return 403;
    case "NO_REVIEWERS_SELECTED":
      return 400;
  }
}

function reReviewErrorMessage(reason: "NOT_FOUND" | "NOT_AUTHOR" | "NO_REVIEWERS_SELECTED"): string {
  switch (reason) {
    case "NOT_FOUND":
      return "Pull request not found";
    case "NOT_AUTHOR":
      return "Only the author can request a re-review";
    case "NO_REVIEWERS_SELECTED":
      return "Select at least one reviewer";
  }
}
