import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { dashboardService } from "../services/dashboard.service.js";
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

  return router;
}
