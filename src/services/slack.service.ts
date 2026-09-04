import type { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import type { PRWithReviewers } from "./pr.service.js";

export type AiReviewOutcome = { ok: true } | { ok: false; error: string };

const AI_REVIEW_ERROR_EXCERPT_CHARS = 300;

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

  buildBatchedCommentMessage(
    pr: PRWithReviewers,
    commenterName: string,
    commentCount: number
  ): { blocks: KnownBlock[]; text: string } {
    const text = `${commenterName} left ${commentCount} comments on "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New Comments*\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${commenterName} left ${commentCount} comments \u00b7 ${pr.workspaceSlug}/${pr.repositorySlug}`,
          },
        ],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildReReviewRequestedMessage(
    pr: PRWithReviewers,
    requesterName: string
  ): { blocks: KnownBlock[]; text: string } {
    const text = `${requesterName} asked you to re-review "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Re-review Requested*\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${requesterName} asked you to take another look • ${pr.workspaceSlug}/${pr.repositorySlug}`,
          },
        ],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildAiReviewFinishedMessage(
    pr: PRWithReviewers,
    outcome: AiReviewOutcome
  ): { blocks: KnownBlock[]; text: string } {
    const text = outcome.ok
      ? `AI review posted on "${pr.title}"`
      : `AI review failed for "${pr.title}"`;
    const headline = outcome.ok
      ? `*AI review posted*\n<${pr.url}|${pr.title}>\nThe findings are in a comment on the pull request.`
      : `*AI review failed*\n<${pr.url}|${pr.title}>\nYou can retry it from the dashboard.`;
    const detail = outcome.ok
      ? `${pr.workspaceSlug}/${pr.repositorySlug}`
      : `${outcome.error.slice(0, AI_REVIEW_ERROR_EXCERPT_CHARS)} • ${pr.workspaceSlug}/${pr.repositorySlug}`;
    const blocks = [
      {
        type: "section",
        text: { type: "mrkdwn", text: headline },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: detail }],
      },
    ] as const;

    return { blocks: blocks as unknown as KnownBlock[], text };
  }

  buildReReviewedMessage(
    pr: PRWithReviewers,
    reviewerName: string
  ): { blocks: KnownBlock[]; text: string } {
    const text = `${reviewerName} re-reviewed "${pr.title}"`;
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Re-reviewed*\n<${pr.url}|${pr.title}>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${reviewerName} took another look • ${pr.workspaceSlug}/${pr.repositorySlug}`,
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
