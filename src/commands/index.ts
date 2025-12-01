import type { App } from "@slack/bolt";
import { registerStatusCommand } from "./status.command.js";
import { registerMyReviewsCommand } from "./my-reviews.command.js";
import { registerMyPRsCommand } from "./my-prs.command.js";
import { registerNudgeCommand } from "./nudge.command.js";
import { registerHelpCommand } from "./help.command.js";
import { registerAdminCommand } from "./admin.command.js";
import { registerMuteNotificationsCommand } from "./mute-notifications.command.js";

export function registerAllCommands(app: App): void {
  registerAdminCommand(app);
  registerHelpCommand(app);
  registerStatusCommand(app);
  registerMyReviewsCommand(app);
  registerMyPRsCommand(app);
  registerNudgeCommand(app);
  registerMuteNotificationsCommand(app);
}
