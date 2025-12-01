import type { App } from "@slack/bolt";

export function registerHelpCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand && subcommand !== "help") return;

    await ack();

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "PR Tracker Commands",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/pr my-reviews`*\nList all PRs waiting for your review.",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/pr my-prs`*\nList all your open PRs with their review status.",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/pr status <workspace/repo/pr-id>`*\nView detailed status of a specific PR.",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/pr nudge <workspace/repo/pr-id>`*\nSend a reminder to pending reviewers.",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*`/pr mute`* / *`/pr unmute`*\nToggle your personal DM notifications on or off.",
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Example: `/pr status myworkspace/myrepo/123`",
          },
        ],
      },
    ];

    await respond({
      response_type: "ephemeral",
      blocks,
      text: "PR Tracker Help",
    });
  });
}
