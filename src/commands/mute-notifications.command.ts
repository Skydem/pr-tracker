import type { App } from "@slack/bolt";
import { prisma } from "../db/client.js";

export function registerMuteNotificationsCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "mute" && subcommand !== "unmute") return;

    await ack();

    const user = await prisma.user.findUnique({
      where: { slackUserId: command.user_id },
    });

    if (!user) {
      await respond({
        response_type: "ephemeral",
        text: "You haven't linked your account yet. Use `/pr link <your-bitbucket-email>` first.",
      });
      return;
    }

    const mute = subcommand === "mute";

    if (user.notificationsMuted === mute) {
      await respond({
        response_type: "ephemeral",
        text: mute
          ? "Your notifications are already muted."
          : "Your notifications are already enabled.",
      });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { notificationsMuted: mute },
    });

    await respond({
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: mute
              ? `:bell_slash: Notifications muted. You won't receive DMs for PR events.`
              : `:bell: Notifications enabled. You'll receive DMs for PR events.`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: mute
                ? "Use `/pr unmute` to re-enable notifications."
                : "Use `/pr mute` to mute notifications.",
            },
          ],
        },
      ],
      text: mute ? "Notifications muted" : "Notifications enabled",
    });
  });
}
