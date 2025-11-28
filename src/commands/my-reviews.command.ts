import type { App } from "@slack/bolt";
import { prService } from "../services/pr.service.js";
import { userService } from "../services/user.service.js";

export function registerMyReviewsCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "my-reviews") return;

    await ack();

    const user = await userService.getUserBySlackId(command.user_id);

    if (!user) {
      await respond({
        response_type: "ephemeral",
        text: "You haven't linked your Bitbucket account yet. Use `/pr link <your-bitbucket-email>` first.",
      });
      return;
    }

    const prs = await prService.getPRsAwaitingReview(user.id);

    if (prs.length === 0) {
      await respond({
        response_type: "ephemeral",
        text: "No PRs awaiting your review! :tada:",
      });
      return;
    }

    const prBlocks = prs.map((pr) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${pr.url}|${pr.title}>*\nby ${pr.author.displayName} • ${pr.workspaceSlug}/${pr.repositorySlug}`,
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Review",
        },
        url: pr.url,
        action_id: `review_pr_${pr.id}`,
      },
    }));

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `PRs Awaiting Your Review (${prs.length})`,
        },
      },
      {
        type: "divider",
      },
      ...prBlocks,
    ];

    await respond({
      response_type: "ephemeral",
      blocks,
      text: `You have ${prs.length} PRs awaiting review`,
    });
  });
}
