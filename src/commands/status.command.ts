import type { App } from "@slack/bolt";
import { prService } from "../services/pr.service.js";
import { parsePRIdentifier } from "../utils/pr-identifier.js";
import { getStatusEmoji } from "../utils/review-status.js";

export function registerStatusCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "status") return;

    await ack();

    const prIdentifier = args[1];

    if (!prIdentifier) {
      await respond({
        response_type: "ephemeral",
        text: "Usage: `/pr status <workspace/repo/pr-id>`",
      });
      return;
    }

    const parseResult = parsePRIdentifier(prIdentifier);
    if (!parseResult.success) {
      await respond({
        response_type: "ephemeral",
        text: parseResult.error,
      });
      return;
    }

    const { workspaceSlug, repositorySlug, prId } = parseResult.data;
    const pr = await prService.getPRByBitbucketId(prId, repositorySlug, workspaceSlug);

    if (!pr) {
      await respond({
        response_type: "ephemeral",
        text: `PR not found: ${prIdentifier}`,
      });
      return;
    }

    const reviewerLines = pr.reviewers.map((r) => {
      const statusEmoji = getStatusEmoji(r.status);
      return `${statusEmoji} ${r.user.displayName} - ${r.status}`;
    });

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: pr.title,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*State:*\n${pr.state}`,
          },
          {
            type: "mrkdwn",
            text: `*Author:*\n${pr.author.displayName}`,
          },
          {
            type: "mrkdwn",
            text: `*Branch:*\n${pr.sourceBranch} → ${pr.destBranch}`,
          },
          {
            type: "mrkdwn",
            text: `*Repository:*\n${workspaceSlug}/${repositorySlug}`,
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Reviewers:*\n${reviewerLines.join("\n") || "No reviewers"}`,
        },
      },
    ];

    if (pr.url) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View in Bitbucket",
            },
            url: pr.url,
            action_id: "view_pr_bitbucket",
          },
        ],
      } as never);
    }

    await respond({
      response_type: "ephemeral",
      blocks,
      text: `PR Status: ${pr.title}`,
    });
  });
}
