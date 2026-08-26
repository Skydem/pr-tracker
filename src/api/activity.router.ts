import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import { clampLimit } from "../utils/activity.js";

export function createActivityApiRouter(): Router {
  const router = createRouter();

  router.get("/activity", async (req: Request, res: Response) => {
    try {
      const personId = typeof req.query.person === "string" ? req.query.person : undefined;
      const limit = clampLimit(req.query.limit);

      if (personId !== undefined) {
        const person = await dashboardService.getPersonRef(personId);
        if (person === null) {
          res.status(404).json({ error: "Person not found" });
          return;
        }
      }

      const activity = await dashboardService.getActivity({ limit, personId });
      res.json(activity);
    } catch (error) {
      console.error("[API] Failed to load activity:", error);
      res.status(500).json({ error: "Failed to load activity" });
    }
  });

  return router;
}
