import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import { renderBoard, renderPersonBoard, renderNotFound } from "./dashboard.view.js";

export function createDashboardRouter(): Router {
  const router = createRouter();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const personId = typeof req.query.person === "string" ? req.query.person : null;

      const board = await dashboardService.getBoard();

      if (personId === null) {
        res.type("html").send(renderBoard(board));
        return;
      }

      const person = await dashboardService.getPersonBoard(
        personId,
        board.generatedAt,
        board
      );

      if (person === null) {
        res.status(404).type("html").send(renderNotFound("That person is not in the tracker."));
        return;
      }

      res.type("html").send(renderPersonBoard(person, board));
    } catch (error) {
      console.error("[Dashboard] Failed to render:", error);
      res.status(500).type("html").send(renderNotFound("The dashboard could not be loaded."));
    }
  });

  return router;
}
