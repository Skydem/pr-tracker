import "dotenv/config";
import { resolve } from "node:path";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalIntEnv(key: string, defaultValue: number): number {
  const parsed = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const config = {
  port: optionalIntEnv("PORT", 3000),

  database: {
    url: requireEnv("DATABASE_URL"),
  },

  slack: {
    botToken: requireEnv("SLACK_BOT_TOKEN"),
    signingSecret: requireEnv("SLACK_SIGNING_SECRET"),
    appToken: requireEnv("SLACK_APP_TOKEN"),
    adminUserId: optionalEnv("SLACK_ADMIN_USER_ID", ""),
    clientId: optionalEnv("SLACK_CLIENT_ID", ""),
    clientSecret: optionalEnv("SLACK_CLIENT_SECRET", ""),
    teamId: optionalEnv("SLACK_TEAM_ID", ""),
  },

  auth: {
    sessionSecret: optionalEnv("SESSION_SECRET", ""),
    sessionDays: optionalIntEnv("SESSION_DAYS", 30),
    publicUrl: optionalEnv("PUBLIC_URL", "").replace(/\/+$/, ""),
  },

  webhookSecret: optionalEnv("WEBHOOK_SECRET", ""),

  dashboard: {
    staleDays: optionalIntEnv("DASHBOARD_STALE_DAYS", 3),
  },

  aiReview: {
    repoPath: optionalEnv("AI_REVIEW_REPO_PATH", "").replace(/\/+$/, ""),
    repositorySlug: optionalEnv("AI_REVIEW_REPOSITORY_SLUG", ""),
    pluginPath: resolve(optionalEnv("AI_REVIEW_PLUGIN_PATH", "ai-review/code-review-bitbucket")),
    command: optionalEnv("AI_REVIEW_COMMAND", "/code-review-bitbucket:code-review"),
    claudeBin: optionalEnv("AI_REVIEW_CLAUDE_BIN", "claude"),
    bitbucketMcpCommand: optionalEnv(
      "AI_REVIEW_BITBUCKET_MCP_COMMAND",
      "npx -y @aashari/mcp-server-atlassian-bitbucket"
    ),
    timeoutMinutes: optionalIntEnv("AI_REVIEW_TIMEOUT_MINUTES", 30),
    bitbucketEmail: optionalEnv("AI_REVIEW_BITBUCKET_EMAIL", "") || optionalEnv("BITBUCKET_EMAIL", ""),
    bitbucketApiToken:
      optionalEnv("AI_REVIEW_BITBUCKET_API_TOKEN", "") || optionalEnv("BITBUCKET_API_TOKEN", ""),
  },

  bitbucket: {
    workspace: optionalEnv("BITBUCKET_WORKSPACE", ""),
    email: optionalEnv("BITBUCKET_EMAIL", ""),
    apiToken: optionalEnv("BITBUCKET_API_TOKEN", ""),
    repos: optionalEnv("BITBUCKET_REPOS", "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
  },
};
