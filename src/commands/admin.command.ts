import type { App } from "@slack/bolt";
import { prisma } from "../db/client.js";
import { config } from "../config/env.js";

export function registerAdminCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand !== "admin") return;

    await ack();

    if (!config.slack.adminUserId) {
      return;
    }

    if (command.user_id !== config.slack.adminUserId) {
      return;
    }

    const adminAction = args[1]?.toLowerCase();

    switch (adminAction) {
      case "stats":
        await handleStats(respond);
        break;
      case "users":
        await handleUsers(respond);
        break;
      case "link":
        await handleForceLink(args.slice(2), respond);
        break;
      case "events":
        await handleEvents(respond);
        break;
      default:
        await showAdminHelp(respond);
    }
  });
}

async function handleStats(respond: RespondFn): Promise<void> {
  const [userCount, prCount, eventCount, linkedUsers, openPRs] =
    await Promise.all([
      prisma.user.count(),
      prisma.pullRequest.count(),
      prisma.pREvent.count(),
      prisma.user.count({ where: { slackUserId: { not: null } } }),
      prisma.pullRequest.count({ where: { state: "OPEN" } }),
    ]);

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "Admin: System Stats" },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Total Users:*\n${userCount}` },
        { type: "mrkdwn", text: `*Linked Users:*\n${linkedUsers}` },
        { type: "mrkdwn", text: `*Total PRs:*\n${prCount}` },
        { type: "mrkdwn", text: `*Open PRs:*\n${openPRs}` },
        { type: "mrkdwn", text: `*Total Events:*\n${eventCount}` },
      ],
    },
  ];

  await respond({ response_type: "ephemeral", blocks, text: "System Stats" });
}

async function handleUsers(respond: RespondFn): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const userLines = users.map((u) => {
    const linked = u.slackUserId ? `:white_check_mark: <@${u.slackUserId}>` : ":x: Not linked";
    return `*${u.displayName}*\n  Email: ${u.bitbucketEmail || "N/A"} | ${linked}`;
  });

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "Admin: Recent Users (20)" },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: userLines.join("\n\n") || "No users found" },
    },
  ];

  await respond({ response_type: "ephemeral", blocks, text: "Users" });
}

async function handleForceLink(
  args: string[],
  respond: RespondFn
): Promise<void> {
  const [bitbucketEmail, slackUserId] = args;

  if (!bitbucketEmail || !slackUserId) {
    await respond({
      response_type: "ephemeral",
      text: "Usage: `/pr admin link <bitbucket-email> <slack-user-id>`\nExample: `/pr admin link john@example.com U12345678`",
    });
    return;
  }

  const cleanSlackId = slackUserId.replace(/^<@/, "").replace(/>$/, "").split("|")[0];

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { bitbucketEmail },
        { bitbucketUuid: bitbucketEmail },
      ],
    },
  });

  if (!user) {
    await respond({
      response_type: "ephemeral",
      text: `:x: No user found with email/uuid: ${bitbucketEmail}`,
    });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { slackUserId: cleanSlackId },
  });

  await respond({
    response_type: "ephemeral",
    text: `:white_check_mark: Linked *${user.displayName}* (${bitbucketEmail}) to <@${cleanSlackId}>`,
  });
}

async function handleEvents(respond: RespondFn): Promise<void> {
  const events = await prisma.pREvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      actor: { select: { displayName: true } },
      pullRequest: { select: { title: true, bitbucketId: true } },
    },
  });

  const eventLines = events.map((e) => {
    const time = e.createdAt.toISOString().slice(0, 16).replace("T", " ");
    return `\`${time}\` *${e.eventType}*\n  PR #${e.pullRequest.bitbucketId}: ${e.pullRequest.title}\n  By: ${e.actor.displayName}`;
  });

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "Admin: Recent Events (10)" },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: eventLines.join("\n\n") || "No events found" },
    },
  ];

  await respond({ response_type: "ephemeral", blocks, text: "Events" });
}

async function showAdminHelp(respond: RespondFn): Promise<void> {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "Admin Panel" },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Available admin commands:*\n\n" +
          "`/pr admin stats` - View system statistics\n" +
          "`/pr admin users` - List recent users\n" +
          "`/pr admin link <email> <slack-id>` - Force link a user\n" +
          "`/pr admin events` - View recent events",
      },
    },
  ];

  await respond({ response_type: "ephemeral", blocks, text: "Admin Help" });
}

type RespondFn = (response: {
  response_type: "ephemeral" | "in_channel";
  text: string;
  blocks?: object[];
}) => Promise<unknown>;
