import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { config } from "../config/env.js";
import { userService } from "../services/user.service.js";
import { renderMessage } from "../dashboard/dashboard.view.js";
import { buildAuthorizeUrl, exchangeCodeForIdentity } from "./slack-oidc.js";
import {
  consumeOAuthState,
  endSession,
  isAuthConfigured,
  oauthStateExpiry,
  randomNonce,
  requireViewer,
  startOAuthState,
  startSession,
} from "./session.js";
import { sanitizeReturnTo } from "./viewer.js";

const CALLBACK_PATH = "/auth/slack/callback";

export function createAuthRouter(): Router {
  const router = createRouter();

  router.get("/slack", (req: Request, res: Response) => {
    if (!isAuthConfigured()) {
      res
        .status(503)
        .type("html")
        .send(
          renderMessage(
            "Sign-in unavailable",
            "Slack sign-in is not configured on this server.",
            null
          )
        );
      return;
    }

    const nonce = randomNonce();
    const state = startOAuthState(res, {
      nonce,
      returnTo: sanitizeReturnTo(req.query.returnTo),
      exp: oauthStateExpiry(),
    });

    res.redirect(buildAuthorizeUrl(state, nonce, callbackUrl(req)));
  });

  router.get("/slack/callback", async (req: Request, res: Response) => {
    if (!isAuthConfigured()) {
      res
        .status(503)
        .type("html")
        .send(
          renderMessage(
            "Sign-in unavailable",
            "Slack sign-in is not configured on this server.",
            null
          )
        );
      return;
    }

    const state = consumeOAuthState(req, res, req.query.state);
    const code = typeof req.query.code === "string" ? req.query.code : null;

    if (typeof req.query.error === "string") {
      res
        .status(400)
        .type("html")
        .send(
          renderMessage("Sign-in cancelled", "Slack did not grant access. Try again.", null)
        );
      return;
    }

    if (state === null || code === null) {
      res
        .status(400)
        .type("html")
        .send(
          renderMessage(
            "Sign-in expired",
            "That sign-in link is no longer valid. Start again from the dashboard.",
            null
          )
        );
      return;
    }

    try {
      const identity = await exchangeCodeForIdentity(code, state.nonce, callbackUrl(req));

      if (config.slack.teamId && identity.teamId !== config.slack.teamId) {
        res
          .status(403)
          .type("html")
          .send(
            renderMessage(
              "Wrong workspace",
              "That Slack account belongs to a different workspace.",
              null
            )
          );
        return;
      }

      const user = await userService.findBySlackIdentity(
        identity.slackUserId,
        identity.email
      );

      startSession(res, {
        userId: user?.id ?? null,
        slackUserId: identity.slackUserId,
        displayName: user?.displayName ?? identity.displayName,
      });

      res.redirect(landingPath(state.returnTo, user?.id ?? null));
    } catch (error) {
      console.error("[Auth] Slack sign-in failed:", error);
      res
        .status(502)
        .type("html")
        .send(
          renderMessage("Sign-in failed", "Slack could not confirm who you are. Try again.", null)
        );
    }
  });

  router.post("/logout", (req: Request, res: Response) => {
    endSession(res);
    res.redirect(sanitizeReturnTo(req.query.returnTo));
  });

  router.get("/me", requireViewer, (req: Request, res: Response) => {
    res.json(req.viewer);
  });

  return router;
}

function landingPath(returnTo: string, userId: string | null): string {
  if (userId !== null && returnTo === "/dashboard") {
    return `/dashboard?person=${encodeURIComponent(userId)}`;
  }
  return returnTo;
}

function callbackUrl(req: Request): string {
  const base = config.auth.publicUrl || `${req.protocol}://${req.get("host") ?? ""}`;
  return `${base}${CALLBACK_PATH}`;
}
