import "dotenv/config";

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
  },

  webhookSecret: optionalEnv("WEBHOOK_SECRET", ""),

  dashboard: {
    staleDays: optionalIntEnv("DASHBOARD_STALE_DAYS", 3),
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
