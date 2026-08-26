export interface Viewer {
  userId: string | null;
  slackUserId: string;
  displayName: string;
}

const SAFE_RETURN_TO = /^\/(?!\/)[^\s\\]*$/;

export function sanitizeReturnTo(raw: unknown, fallback = "/dashboard"): string {
  if (typeof raw !== "string" || !SAFE_RETURN_TO.test(raw)) {
    return fallback;
  }
  return raw;
}
