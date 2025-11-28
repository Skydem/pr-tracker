import pkg from "@slack/bolt";
const { App } = pkg;
import express from "express";
import { config } from "./config/env.js";
import { createBitbucketWebhookRouter } from "./webhooks/bitbucket.handler.js";
import { registerAllCommands } from "./commands/index.js";
import { userService } from "./services/user.service.js";
import { slackService } from "./services/slack.service.js";
import { prisma } from "./db/client.js";

async function main() {
  // Slack app with Socket Mode for slash commands
  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken,
  });

  userService.setSlackApp(app);
  slackService.setApp(app);

  registerAllCommands(app);

  app.action(/^(view_pr|review_pr|view_my_pr)/, async ({ ack }) => {
    await ack();
  });

  // Separate Express server for HTTP endpoints (webhooks, health)
  const httpServer = express();
  httpServer.use(express.json());
  httpServer.use("/webhooks/bitbucket", createBitbucketWebhookRouter());
  httpServer.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  await prisma.$connect();
  console.log("Database connected");

  // Start both servers
  await app.start();
  console.log("Slack app started (Socket Mode)");

  httpServer.listen(config.port, () => {
    console.log(`HTTP server running on port ${config.port}`);
    console.log(`Webhook endpoint: http://localhost:${config.port}/webhooks/bitbucket`);
    console.log(`Health check: http://localhost:${config.port}/health`);
  });
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
