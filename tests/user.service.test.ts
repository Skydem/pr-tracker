import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { UserService } from "../src/services/user.service.js";

describe("UserService", () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  describe("findOrCreateUser", () => {
    it("should return existing user when found by bitbucketUuid", async () => {
      const existingUser = {
        id: "user-1",
        bitbucketUuid: "bb-uuid-1",
        bitbucketEmail: "test@example.com",
        slackUserId: "slack-1",
        displayName: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue(existingUser);

      const result = await userService.findOrCreateUser(
        "bb-uuid-1",
        "test@example.com",
        "Test User"
      );

      expect(result).toEqual(existingUser);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { bitbucketUuid: "bb-uuid-1" },
            { bitbucketEmail: "test@example.com" },
          ],
        },
      });
    });

    it("should create new user when not found", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const newUser = {
        id: "user-2",
        bitbucketUuid: "bb-uuid-2",
        bitbucketEmail: "new@example.com",
        slackUserId: null,
        displayName: "New User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.create).mockResolvedValue(newUser);

      const result = await userService.findOrCreateUser(
        "bb-uuid-2",
        "new@example.com",
        "New User"
      );

      expect(result).toEqual(newUser);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          bitbucketUuid: "bb-uuid-2",
          bitbucketEmail: "new@example.com",
          displayName: "New User",
        },
      });
    });

    it("should update user if missing bitbucketUuid or email", async () => {
      const existingUser = {
        id: "user-3",
        bitbucketUuid: null,
        bitbucketEmail: "partial@example.com",
        slackUserId: null,
        displayName: "Partial User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser = {
        ...existingUser,
        bitbucketUuid: "bb-uuid-3",
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue(existingUser);
      vi.mocked(prisma.user.update).mockResolvedValue(updatedUser);

      const result = await userService.findOrCreateUser(
        "bb-uuid-3",
        "partial@example.com",
        "Partial User"
      );

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe("linkSlackUser", () => {
    it("should link slack user to bitbucket user", async () => {
      const user = {
        id: "user-1",
        bitbucketUuid: "bb-uuid-1",
        bitbucketEmail: "test@example.com",
        slackUserId: null,
        displayName: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser = { ...user, slackUserId: "slack-123" };

      vi.mocked(prisma.user.findFirst).mockResolvedValue(user);
      vi.mocked(prisma.user.update).mockResolvedValue(updatedUser);

      const result = await userService.linkSlackUser("bb-uuid-1", "slack-123");

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { slackUserId: "slack-123" },
      });
    });

    it("should return null if user not found", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const result = await userService.linkSlackUser(
        "non-existent",
        "slack-123"
      );

      expect(result).toBeNull();
    });
  });

  describe("getUserBySlackId", () => {
    it("should return user by slack id", async () => {
      const user = {
        id: "user-1",
        bitbucketUuid: "bb-uuid-1",
        bitbucketEmail: "test@example.com",
        slackUserId: "slack-1",
        displayName: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(user);

      const result = await userService.getUserBySlackId("slack-1");

      expect(result).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { slackUserId: "slack-1" },
      });
    });
  });
});
