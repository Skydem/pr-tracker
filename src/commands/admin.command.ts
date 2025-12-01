import type { App } from "@slack/bolt";
import { prisma } from "../db/client.js";
import { config } from "../config/env.js";

export function registerAdminCommand(app: App): void {
  app.command("/pr", async ({ command, ack, respond }) => {
    const text = command.text.trim();
    const firstWord = text.split(/\s+/)[0]?.toLowerCase();

    if (firstWord !== "admin") return;

    await ack();

    if (!config.slack.adminUserId) {
      return;
    }

    if (command.user_id !== config.slack.adminUserId) {
      return;
    }

    const afterAdmin = text.slice(5).trim();
    const adminAction = afterAdmin.split(/\s+/)[0]?.toLowerCase();
    const restOfArgs = afterAdmin.slice(adminAction?.length || 0).trim();

    switch (adminAction) {
      case "stats":
        await handleStats(respond);
        break;
      case "users":
        await handleUsers(respond);
        break;
      case "link":
        await handleForceLink(restOfArgs, respond);
        break;
      case "merge":
        await handleMerge(restOfArgs, respond);
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

function parseQuotedArgs(input: string): string[] {
  const args: string[] = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    args.push(match[1] || match[2]);
  }
  return args;
}

async function handleForceLink(
  argsStr: string,
  respond: RespondFn
): Promise<void> {
  const args = parseQuotedArgs(argsStr);
  const [nameOrEmail, slackUserId] = args;

  if (!nameOrEmail || !slackUserId) {
    await respond({
      response_type: "ephemeral",
      text: "Usage: `/pr admin link \"Display Name\" @slack-user`\nExample: `/pr admin link \"Tomasz Torbus\" @tomek`",
    });
    return;
  }

  const cleanSlackId = slackUserId.replace(/^<@/, "").replace(/>$/, "").split("|")[0];

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { displayName: { equals: nameOrEmail, mode: "insensitive" } },
        { bitbucketEmail: nameOrEmail },
        { bitbucketUuid: nameOrEmail },
      ],
    },
  });

  if (!user) {
    await respond({
      response_type: "ephemeral",
      text: `:x: No user found matching: ${nameOrEmail}`,
    });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { slackUserId: cleanSlackId },
  });

  await respond({
    response_type: "ephemeral",
    text: `:white_check_mark: Linked *${user.displayName}* to <@${cleanSlackId}>`,
  });
}

async function handleMerge(
  argsStr: string,
  respond: RespondFn
): Promise<void> {
  const args = parseQuotedArgs(argsStr);
  const [sourceName, targetName] = args;

  if (!sourceName || !targetName) {
    await respond({
      response_type: "ephemeral",
      text: "Usage: `/pr admin merge \"Source Name\" \"Target Name\"`\nMerges source into target (keeps target, deletes source)",
    });
    return;
  }

  const sourceUser = await prisma.user.findFirst({
    where: { displayName: { equals: sourceName, mode: "insensitive" } },
  });

  const targetUser = await prisma.user.findFirst({
    where: { displayName: { equals: targetName, mode: "insensitive" } },
  });

  if (!sourceUser) {
    await respond({
      response_type: "ephemeral",
      text: `:x: Source user not found: ${sourceName}`,
    });
    return;
  }

  if (!targetUser) {
    await respond({
      response_type: "ephemeral",
      text: `:x: Target user not found: ${targetName}`,
    });
    return;
  }

  if (sourceUser.id === targetUser.id) {
    await respond({
      response_type: "ephemeral",
      text: `:x: Source and target are the same user`,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.pullRequest.updateMany({
      where: { authorId: sourceUser.id },
      data: { authorId: targetUser.id },
    });

    await tx.pRReviewer.updateMany({
      where: { userId: sourceUser.id },
      data: { userId: targetUser.id },
    });

    await tx.pREvent.updateMany({
      where: { actorId: sourceUser.id },
      data: { actorId: targetUser.id },
    });

    await tx.user.delete({ where: { id: sourceUser.id } });

    const updateData: Record<string, string> = {};
    if (sourceUser.bitbucketUuid && !targetUser.bitbucketUuid) {
      updateData.bitbucketUuid = sourceUser.bitbucketUuid;
    }
    if (sourceUser.bitbucketEmail && !targetUser.bitbucketEmail) {
      updateData.bitbucketEmail = sourceUser.bitbucketEmail;
    }
    if (sourceUser.slackUserId && !targetUser.slackUserId) {
      updateData.slackUserId = sourceUser.slackUserId;
    }

    if (Object.keys(updateData).length > 0) {
      await tx.user.update({
        where: { id: targetUser.id },
        data: updateData,
      });
    }
  });

  await respond({
    response_type: "ephemeral",
    text: `:white_check_mark: Merged *${sourceUser.displayName}* into *${targetUser.displayName}*`,
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
          "`/pr admin link \"Name\" @user` - Link user by display name\n" +
          "`/pr admin merge \"Source\" \"Target\"` - Merge duplicate users\n" +
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
