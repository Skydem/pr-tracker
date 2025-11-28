import type { App } from "@slack/bolt";
import { userService } from "../services/user.service.js";
import { prisma } from "../db/client.js";

export function registerLinkUserCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "link") return;

    await ack();

    const bitbucketEmail = args[1];

    if (!bitbucketEmail) {
      await respond({
        response_type: "ephemeral",
        text: "Usage: `/pr link <your-bitbucket-email>`",
      });
      return;
    }

    if (!isValidEmail(bitbucketEmail)) {
      await respond({
        response_type: "ephemeral",
        text: "Please provide a valid email address.",
      });
      return;
    }

    const existingSlackLink = await prisma.user.findUnique({
      where: { slackUserId: command.user_id },
    });

    if (existingSlackLink) {
      await respond({
        response_type: "ephemeral",
        text: `Your Slack account is already linked to Bitbucket user: ${existingSlackLink.displayName} (${existingSlackLink.bitbucketEmail})`,
      });
      return;
    }

    let user = await prisma.user.findUnique({
      where: { bitbucketEmail },
    });

    if (user) {
      if (user.slackUserId && user.slackUserId !== command.user_id) {
        await respond({
          response_type: "ephemeral",
          text: "This Bitbucket email is already linked to another Slack account.",
        });
        return;
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: { slackUserId: command.user_id },
      });
    } else {
      user = await prisma.user.create({
        data: {
          bitbucketEmail,
          slackUserId: command.user_id,
          displayName: bitbucketEmail.split("@")[0],
        },
      });
    }

    await respond({
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:white_check_mark: Successfully linked your Slack account to Bitbucket email: *${bitbucketEmail}*`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "You will now receive DM notifications for PR events.",
            },
          ],
        },
      ],
      text: `Successfully linked to ${bitbucketEmail}`,
    });
  });
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
