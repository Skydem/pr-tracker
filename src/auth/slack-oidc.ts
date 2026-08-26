import { config } from "../config/env.js";

const AUTHORIZE_URL = "https://slack.com/openid/connect/authorize";
const TOKEN_URL = "https://slack.com/api/openid.connect.token";
const SCOPES = "openid,profile,email";
const CLOCK_SKEW_SECONDS = 60;

export interface SlackIdentity {
  slackUserId: string;
  teamId: string | null;
  displayName: string;
  email: string | null;
}

interface IdTokenClaims {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  name?: string;
  email?: string;
  "https://slack.com/user_id"?: string;
  "https://slack.com/team_id"?: string;
  user_id?: string;
  team_id?: string;
}

export function buildAuthorizeUrl(
  state: string,
  nonce: string,
  redirectUri: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    scope: SCOPES,
    client_id: config.slack.clientId,
    state,
    nonce,
    redirect_uri: redirectUri,
  });

  if (config.slack.teamId) {
    params.set("team", config.slack.teamId);
  }

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForIdentity(
  code: string,
  nonce: string,
  redirectUri: string
): Promise<SlackIdentity> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });

  const body = (await response.json()) as { ok?: boolean; error?: string; id_token?: string };

  if (!body.ok || !body.id_token) {
    throw new Error(`Slack token exchange failed: ${body.error ?? response.status}`);
  }

  return identityFromIdToken(body.id_token, nonce);
}

function identityFromIdToken(idToken: string, nonce: string): SlackIdentity {
  const claims = decodeIdTokenClaims(idToken);

  if (claims === null) {
    throw new Error("Slack returned an unreadable id_token");
  }

  if (claims.iss !== "https://slack.com") {
    throw new Error(`Unexpected id_token issuer: ${claims.iss}`);
  }

  if (claims.aud !== config.slack.clientId) {
    throw new Error("id_token was issued for a different Slack app");
  }

  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < Date.now() / 1000) {
    throw new Error("id_token has expired");
  }

  if (claims.nonce !== nonce) {
    throw new Error("id_token nonce does not match the sign-in request");
  }

  const slackUserId = claims["https://slack.com/user_id"] ?? claims.user_id ?? claims.sub;

  if (!slackUserId) {
    throw new Error("id_token carries no Slack user id");
  }

  return {
    slackUserId,
    teamId: claims["https://slack.com/team_id"] ?? claims.team_id ?? null,
    displayName: claims.name ?? slackUserId,
    email: claims.email ?? null,
  };
}

function decodeIdTokenClaims(idToken: string): IdTokenClaims | null {
  const parts = idToken.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as IdTokenClaims;
  } catch {
    return null;
  }
}
