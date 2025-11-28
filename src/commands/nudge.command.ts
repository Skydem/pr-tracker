import type { App } from "@slack/bolt";
import { prService } from "../services/pr.service.js";
import { userService } from "../services/user.service.js";
import { notificationService } from "../services/notification.service.js";

export function registerNudgeCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "nudge") return;

    await ack();

    const user = await userService.getUserBySlackId(command.user_id);

    if (!user) {
      await respond({
        response_type: "ephemeral",
        text: "You haven't linked your Bitbucket account yet. Use `/pr link <your-bitbucket-email>` first.",
      });
      return;
    }

    const prIdentifier = args[1];

    if (!prIdentifier) {
      await respond({
        response_type: "ephemeral",
        text: "Usage: `/pr nudge <workspace/repo/pr-id>`",
      });
      return;
    }

    const parts = prIdentifier.split("/");
    if (parts.length !== 3) {
      await respond({
        response_type: "ephemeral",
        text: "Invalid format. Use: `workspace/repo/pr-id`",
      });
      return;
    }

    const [workspaceSlug, repositorySlug, prIdStr] = parts;
    const prId = parseInt(prIdStr, 10);

    if (isNaN(prId)) {
      await respond({
        response_type: "ephemeral",
        text: "Invalid PR ID. Must be a number.",
      });
      return;
    }

    const pr = await prService.getPRByBitbucketId(prId, repositorySlug, workspaceSlug);

    if (!pr) {
      await respond({
        response_type: "ephemeral",
        text: `PR not found: ${prIdentifier}`,
      });
      return;
    }

    const notifiedCount = await notificationService.nudgeReviewers(pr);

    if (notifiedCount === 0) {
      await respond({
        response_type: "ephemeral",
        text: "No pending reviewers with linked Slack accounts to nudge.",
      });
      return;
    }

    await respond({
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:bell: Sent review reminders to *${notifiedCount}* reviewer(s) for "${pr.title}"`,
          },
        },
      ],
      text: `Nudged ${notifiedCount} reviewers`,
    });
  });
}
