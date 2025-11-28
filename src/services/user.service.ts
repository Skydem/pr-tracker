import { prisma } from "../db/client.js";
import type { User } from "@prisma/client";
import type { App } from "@slack/bolt";

export class UserService {
  private slackApp: App | null = null;

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
      return user;
    }

    return prisma.user.create({
      data: {
        bitbucketUuid,
        bitbucketEmail: email,
        displayName,
      },
    });
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
}

export const userService = new UserService();
