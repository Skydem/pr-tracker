import type { App } from "@slack/bolt";
import { prService } from "../services/pr.service.js";
import { userService } from "../services/user.service.js";

export function registerMyPRsCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "my-prs") return;

    await ack();

    const user = await userService.getUserBySlackId(command.user_id);

    if (!user) {
      await respond({
        response_type: "ephemeral",
        text: "You haven't linked your Bitbucket account yet. Use `/pr link <your-bitbucket-email>` first.",
      });
      return;
    }

    const prs = await prService.getUserPRs(user.id);

    if (prs.length === 0) {
      await respond({
        response_type: "ephemeral",
        text: "You don't have any open PRs.",
      });
      return;
    }

    const prBlocks = prs.map((pr) => {
      const approvedCount = pr.reviewers.filter(
        (r) => r.status === "APPROVED"
      ).length;
      const changesCount = pr.reviewers.filter(
        (r) => r.status === "CHANGES_REQUESTED"
      ).length;
      const pendingCount = pr.reviewers.filter(
        (r) => r.status === "PENDING"
      ).length;

      let statusText = "";
      if (changesCount > 0) {
        statusText = `:x: ${changesCount} requested changes`;
      } else if (pendingCount > 0) {
        statusText = `:hourglass: ${pendingCount} pending`;
      } else if (approvedCount === pr.reviewers.length && approvedCount > 0) {
        statusText = `:white_check_mark: All approved!`;
      }

      return {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${pr.url}|${pr.title}>*\n${pr.workspaceSlug}/${pr.repositorySlug} • ${statusText}`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "View",
          },
          url: pr.url,
          action_id: `view_my_pr_${pr.id}`,
        },
      };
    });

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Your Open PRs (${prs.length})`,
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
      text: `You have ${prs.length} open PRs`,
    });
  });
}
