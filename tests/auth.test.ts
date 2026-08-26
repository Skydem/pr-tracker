import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { UserService } from "../src/services/user.service.js";
import { decodeSignedToken, encodeSignedToken } from "../src/auth/signed-token.js";
import { sanitizeReturnTo } from "../src/auth/viewer.js";

const SECRET = "test-session-secret";

describe("signed tokens", () => {
  it("round-trips a payload", () => {
    const token = encodeSignedToken({ userId: "user-1", exp: 42 }, SECRET);

    expect(decodeSignedToken<{ userId: string; exp: number }>(token, SECRET)).toEqual({
      userId: "user-1",
      exp: 42,
    });
  });

  it("rejects a tampered payload", () => {
    const token = encodeSignedToken({ userId: "user-1" }, SECRET);
    const forged = `${Buffer.from('{"userId":"user-2"}', "utf8").toString("base64url")}.${token.split(".")[1]}`;

    expect(decodeSignedToken(forged, SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = encodeSignedToken({ userId: "user-1" }, "other-secret");

    expect(decodeSignedToken(token, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(decodeSignedToken("", SECRET)).toBeNull();
    expect(decodeSignedToken("no-signature", SECRET)).toBeNull();
  });
});

describe("sanitizeReturnTo", () => {
  it("keeps same-site paths", () => {
    expect(sanitizeReturnTo("/dashboard?person=user-1")).toBe("/dashboard?person=user-1");
  });

  it("falls back for absolute and protocol-relative urls", () => {
    expect(sanitizeReturnTo("https://evil.example/steal")).toBe("/dashboard");
    expect(sanitizeReturnTo("//evil.example")).toBe("/dashboard");
    expect(sanitizeReturnTo("/back\\slash")).toBe("/dashboard");
  });

  it("falls back for missing values", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/dashboard");
    expect(sanitizeReturnTo(["/dashboard"])).toBe("/dashboard");
  });
});

describe("UserService.findBySlackIdentity", () => {
  let userService: UserService;

  const user = {
    id: "user-1",
    bitbucketUuid: "bb-1",
    bitbucketEmail: "dev@example.com",
    slackUserId: "U123",
    displayName: "Dev Eloper",
    notificationsMuted: false,
    isWatcher: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  it("returns the user already linked to that Slack id", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user);

    expect(await userService.findBySlackIdentity("U123", "dev@example.com")).toEqual(user);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("links an unlinked user matched by email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...user, slackUserId: null });
    vi.mocked(prisma.user.update).mockResolvedValue(user);

    expect(await userService.findBySlackIdentity("U123", "DEV@example.com")).toEqual(user);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        bitbucketEmail: { equals: "DEV@example.com", mode: "insensitive" },
        slackUserId: null,
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { slackUserId: "U123" },
    });
  });

  it("returns null when nothing matches", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    expect(await userService.findBySlackIdentity("U123", "stranger@example.com")).toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("does not steal a link when the Slack account has no email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    expect(await userService.findBySlackIdentity("U123", null)).toBeNull();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
