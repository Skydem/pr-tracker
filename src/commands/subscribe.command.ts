import type { App } from "@slack/bolt";
import { prisma } from "../db/client.js";

export function registerSubscribeCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "watch" && subcommand !== "unwatch") return;

    await ack();

    const isWatching = subcommand === "watch";

    let user = await prisma.user.findUnique({
      where: { slackUserId: command.user_id },
    });

    if (!user) {
      const slackUserInfo = await app.client.users.info({ user: command.user_id });
      const displayName = slackUserInfo.user?.real_name || slackUserInfo.user?.name || "Unknown";

      user = await prisma.user.create({
        data: {
          slackUserId: command.user_id,
          displayName,
          isWatcher: isWatching,
        },
      });

      if (isWatching) {
        await respond({
          response_type: "ephemeral",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `:eye: You're now watching all PRs.\nYou'll receive notifications when PRs are created and fully approved.`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: "Use `/pr unwatch` to stop watching.",
                },
              ],
            },
          ],
          text: "You're now watching all PRs",
        });
      }
      return;
    }

    if (user.isWatcher === isWatching) {
      await respond({
        response_type: "ephemeral",
        text: isWatching
          ? "You're already watching PRs."
          : "You're not currently watching PRs.",
      });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isWatcher: isWatching },
    });

    await respond({
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: isWatching
              ? `:eye: You're now watching all PRs.\nYou'll receive notifications when PRs are created and fully approved.`
              : `:no_bell: You've stopped watching PRs.\nYou'll no longer receive broadcast notifications.`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: isWatching
                ? "Use `/pr unwatch` to stop watching."
                : "Use `/pr watch` to start watching again.",
            },
          ],
        },
      ],
      text: isWatching ? "You're now watching all PRs" : "You've stopped watching PRs",
    });
  });
}
