import { prisma } from "../db/client.js";
import type { User } from "@prisma/client";
import type { App } from "@slack/bolt";
import { findBestMatch } from "../utils/fuzzy-match.js";

interface SlackMember {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    real_name?: string;
    display_name?: string;
  };
  deleted?: boolean;
  is_bot?: boolean;
}

export class UserService {
  private slackApp: App | null = null;
  private slackUsersCache: SlackMember[] | null = null;
  private slackUsersCacheTime: number = 0;
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  setSlackApp(app: App) {
    this.slackApp = app;
  }

  async findOrCreateUser(
    bitbucketUuid: string,
    email: string | null,
    displayName: string
  ): Promise<User> {
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { bitbucketUuid },
          ...(email ? [{ bitbucketEmail: email }] : []),
        ],
      },
    });

    if (user) {
      if (!user.bitbucketUuid || !user.bitbucketEmail) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            bitbucketUuid: user.bitbucketUuid ?? bitbucketUuid,
            bitbucketEmail: user.bitbucketEmail ?? email,
            displayName,
          },
        });
      }

      if (!user.slackUserId) {
        user = await this.tryAutoLinkByName(user);
      }

      return user;
    }

    const newUser = await prisma.user.create({
      data: {
        bitbucketUuid,
        bitbucketEmail: email,
        displayName,
      },
    });

    return this.tryAutoLinkByName(newUser);
  }

  async linkSlackUser(
    bitbucketIdentifier: string,
    slackUserId: string
  ): Promise<User | null> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { bitbucketUuid: bitbucketIdentifier },
          { bitbucketEmail: bitbucketIdentifier },
        ],
      },
    });

    if (!user) {
      return null;
    }

    return prisma.user.update({
      where: { id: user.id },
      data: { slackUserId },
    });
  }

  async resolveSlackUserId(bitbucketUuid: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { bitbucketUuid },
    });

    if (user?.slackUserId) {
      return user.slackUserId;
    }

    if (user?.bitbucketEmail && this.slackApp) {
      try {
        const result = await this.slackApp.client.users.lookupByEmail({
          email: user.bitbucketEmail,
        });

        if (result.user?.id) {
          await prisma.user.update({
            where: { id: user.id },
            data: { slackUserId: result.user.id },
          });
          return result.user.id;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  async getUserBySlackId(slackUserId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { slackUserId },
    });
  }

  async getUserByBitbucketUuid(bitbucketUuid: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { bitbucketUuid },
    });
  }

  async tryAutoLinkByName(user: User): Promise<User> {
    if (!this.slackApp || user.slackUserId) {
      return user;
    }

    try {
      const slackUsers = await this.getSlackUsers();
      if (!slackUsers.length) {
        return user;
      }

      const linkedSlackIds = await this.getLinkedSlackUserIds();
      const availableSlackUsers = slackUsers.filter(
        (su) => !su.deleted && !su.is_bot && !linkedSlackIds.has(su.id)
      );

      const match = findBestMatch(
        user.displayName,
        availableSlackUsers,
        (su) => this.getSlackUserDisplayName(su),
        0.7
      );

      if (match) {
        console.log(
          `[AutoLink] Matched "${user.displayName}" to Slack user "${this.getSlackUserDisplayName(match.item)}" (score: ${match.score.toFixed(2)})`
        );

        return prisma.user.update({
          where: { id: user.id },
          data: { slackUserId: match.item.id },
        });
      }
    } catch (error) {
      console.error("[AutoLink] Failed to auto-link user:", error);
    }

    return user;
  }

  private getSlackUserDisplayName(member: SlackMember): string {
    return (
      member.profile?.real_name ||
      member.real_name ||
      member.profile?.display_name ||
      member.name
    );
  }

  private async getSlackUsers(): Promise<SlackMember[]> {
    if (!this.slackApp) {
      return [];
    }

    const now = Date.now();
    if (
      this.slackUsersCache &&
      now - this.slackUsersCacheTime < UserService.CACHE_TTL_MS
    ) {
      return this.slackUsersCache;
    }

    try {
      const result = await this.slackApp.client.users.list({});
      const members = (result.members || []) as SlackMember[];

      this.slackUsersCache = members;
      this.slackUsersCacheTime = now;

      return members;
    } catch (error) {
      console.error("[AutoLink] Failed to fetch Slack users:", error);
      return this.slackUsersCache || [];
    }
  }

  private async getLinkedSlackUserIds(): Promise<Set<string>> {
    const linkedUsers = await prisma.user.findMany({
      where: { slackUserId: { not: null } },
      select: { slackUserId: true },
    });

    return new Set(linkedUsers.map((u) => u.slackUserId!));
  }
}

export const userService = new UserService();
