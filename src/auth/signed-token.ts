import { createHmac, timingSafeEqual } from "node:crypto";

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function encodeSignedToken(payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function decodeSignedToken<T>(token: string, secret: string): T | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!safeEquals(signature, sign(body, secret))) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
