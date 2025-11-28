import { App, ExpressReceiver } from "@slack/bolt";
import express from "express";
import { config } from "./config/env.js";
import { createBitbucketWebhookRouter } from "./webhooks/bitbucket.handler.js";
import { registerAllCommands } from "./commands/index.js";
import { userService } from "./services/user.service.js";
import { slackService } from "./services/slack.service.js";
import { prisma } from "./db/client.js";

async function main() {
  const receiver = new ExpressReceiver({
    signingSecret: config.slack.signingSecret,
    endpoints: "/slack/events",
  });

  const app = new App({
    token: config.slack.botToken,
    receiver,
    appToken: config.slack.appToken,
  });

  userService.setSlackApp(app);
  slackService.setApp(app);

  registerAllCommands(app);

  receiver.router.use(express.json());

  receiver.router.use("/webhooks/bitbucket", createBitbucketWebhookRouter());

  receiver.router.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.action(/^(view_pr|review_pr|view_my_pr)/, async ({ ack }) => {
    await ack();
  });

  await prisma.$connect();
  console.log("Database connected");

  await app.start(config.port);
  console.log(`PR Tracker is running on port ${config.port}`);
  console.log(`Webhook endpoint: http://localhost:${config.port}/webhooks/bitbucket`);
  console.log(`Slack events: http://localhost:${config.port}/slack/events`);
  console.log(`Health check: http://localhost:${config.port}/health`);
}

main().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});
