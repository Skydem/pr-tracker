import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/env.js";
import { userService } from "../services/user.service.js";
import { decodeSignedToken, encodeSignedToken } from "./signed-token.js";
import type { Viewer } from "./viewer.js";

declare global {
  namespace Express {
    interface Request {
      viewer?: Viewer | null;
    }
  }
}

const SESSION_COOKIE = "pr_tracker_session";
const OAUTH_STATE_COOKIE = "pr_tracker_oauth";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

interface SessionPayload {
  userId: string | null;
  slackUserId: string;
  displayName: string;
  exp: number;
}

export interface OAuthState {
  nonce: string;
  returnTo: string;
  exp: number;
}

export function isAuthConfigured(): boolean {
  return Boolean(
    config.slack.clientId && config.slack.clientSecret && config.auth.sessionSecret
  );
}

export function randomNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function startSession(res: Response, viewer: Viewer): void {
  const payload: SessionPayload = {
    userId: viewer.userId,
    slackUserId: viewer.slackUserId,
    displayName: viewer.displayName,
    exp: nowSeconds() + config.auth.sessionDays * 24 * 60 * 60,
  };

  setCookie(res, SESSION_COOKIE, encodeSignedToken(payload, config.auth.sessionSecret), {
    maxAgeSeconds: config.auth.sessionDays * 24 * 60 * 60,
  });
}

export function endSession(res: Response): void {
  setCookie(res, SESSION_COOKIE, "", { maxAgeSeconds: 0 });
}

export function startOAuthState(res: Response, state: OAuthState): string {
  setCookie(res, OAUTH_STATE_COOKIE, state.nonce, {
    maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
  });
  return encodeSignedToken(state, config.auth.sessionSecret);
}

export function consumeOAuthState(req: Request, res: Response, raw: unknown): OAuthState | null {
  const cookieNonce = readCookie(req, OAUTH_STATE_COOKIE);
  setCookie(res, OAUTH_STATE_COOKIE, "", { maxAgeSeconds: 0 });

  if (typeof raw !== "string" || cookieNonce === null) {
    return null;
  }

  const state = decodeSignedToken<OAuthState>(raw, config.auth.sessionSecret);

  if (state === null || state.nonce !== cookieNonce || state.exp < nowSeconds()) {
    return null;
  }

  return state;
}

export function oauthStateExpiry(): number {
  return nowSeconds() + OAUTH_STATE_TTL_SECONDS;
}

export async function attachViewer(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  req.viewer = await readSession(req);
  next();
}

export function requireViewer(req: Request, res: Response, next: NextFunction): void {
  const viewer = req.viewer ?? null;

  if (viewer === null) {
    res.status(401).json({ error: "Sign in with Slack to do that" });
    return;
  }

  if (viewer.userId === null) {
    res.status(403).json({ error: "Your Slack account is not linked to a tracked developer" });
    return;
  }

  next();
}

async function readSession(req: Request): Promise<Viewer | null> {
  if (!isAuthConfigured()) {
    return null;
  }

  const raw = readCookie(req, SESSION_COOKIE);

  if (raw === null) {
    return null;
  }

  const payload = decodeSignedToken<SessionPayload>(raw, config.auth.sessionSecret);

  if (payload === null || payload.exp < nowSeconds()) {
    return null;
  }

  if (payload.userId !== null) {
    return {
      userId: payload.userId,
      slackUserId: payload.slackUserId,
      displayName: payload.displayName,
    };
  }

  const linked = await userService.getUserBySlackId(payload.slackUserId);

  return {
    userId: linked?.id ?? null,
    slackUserId: payload.slackUserId,
    displayName: linked?.displayName ?? payload.displayName,
  };
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;

  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return null;
}

function setCookie(
  res: Response,
  name: string,
  value: string,
  options: { maxAgeSeconds: number }
): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`,
  ];

  if (config.auth.publicUrl.startsWith("https://")) {
    parts.push("Secure");
  }

  res.append("Set-Cookie", parts.join("; "));
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
