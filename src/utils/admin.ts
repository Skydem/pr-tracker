import { config } from "../config/env.js";

export function isAdminSlackUser(slackUserId: string | null | undefined): boolean {
  return !!slackUserId && config.slack.adminUserIds.includes(slackUserId);
}
