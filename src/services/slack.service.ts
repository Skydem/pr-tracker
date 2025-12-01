import type { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import type { PRWithReviewers } from "./pr.service.js";

export class SlackService {
  private app: App | null = null;

  setApp(app: App) {
    this.app = app;
  }

  async sendDM(slackUserId: string, blocks: KnownBlock[], text: string): Promise<void> {
    if (!this.app) {
      console.error("[SlackService] Slack app not initialized");
      return;
    }

    try {
      await this.app.client.chat.postMessage({
        channel: slackUserId,
        blocks,
        text,
      });
    } catch (error) {
      console.error(`[SlackService] Failed to send DM to ${slackUserId}:`, error);
    }
  }

  buildPRCreatedMessage(pr: PRWithReviewers): { blocks: KnownBlock[]; text: string } {
    const text = `You've been added as a reviewer on "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New PR Review Request*\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "section",
        fields: [
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
            text: `*Repository:*\n${pr.workspaceSlug}/${pr.repositorySlug}`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View PR",
            },
            url: pr.url,
            action_id: "view_pr",
          },
        ],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildPRUpdatedMessage(pr: PRWithReviewers): { blocks: KnownBlock[]; text: string } {
    const text = `${pr.author.displayName} updated "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*PR Updated*\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Updated by ${pr.author.displayName} • ${pr.workspaceSlug}/${pr.repositorySlug}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "The author has made changes. Please re-review.",
        },
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildChangesRequestedMessage(
    pr: PRWithReviewers,
    reviewerName: string
  ): { blocks: KnownBlock[]; text: string } {
    const text = `${reviewerName} requested changes on "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Changes Requested*\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${reviewerName} requested changes • ${pr.workspaceSlug}/${pr.repositorySlug}`,
          },
        ],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildAllApprovedMessage(pr: PRWithReviewers): { blocks: KnownBlock[]; text: string } {
    const text = `All reviewers approved "${pr.title}"!`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*All Reviewers Approved!* :white_check_mark:\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${pr.workspaceSlug}/${pr.repositorySlug} • Ready to merge`,
          },
        ],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildCommentAddedMessage(
    pr: PRWithReviewers,
    commenterName: string
  ): { blocks: KnownBlock[]; text: string } {
    const text = `${commenterName} commented on "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New Comment*\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${commenterName} left a comment • ${pr.workspaceSlug}/${pr.repositorySlug}`,
          },
        ],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildNudgeMessage(pr: PRWithReviewers): { blocks: KnownBlock[]; text: string } {
    const text = `Reminder: Please review "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Review Reminder* :bell:\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${pr.author.displayName} is waiting for your review • ${pr.workspaceSlug}/${pr.repositorySlug}`,
          },
        ],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }
}

export const slackService = new SlackService();
