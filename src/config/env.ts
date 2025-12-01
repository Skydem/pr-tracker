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

export const config = {
  port: parseInt(optionalEnv("PORT", "3000"), 10),

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
};
