import type { App } from "@slack/bolt";
import { registerStatusCommand } from "./status.command.js";
import { registerMyReviewsCommand } from "./my-reviews.command.js";
import { registerMyPRsCommand } from "./my-prs.command.js";
import { registerLinkUserCommand } from "./link-user.command.js";
import { registerNudgeCommand } from "./nudge.command.js";
import { registerHelpCommand } from "./help.command.js";

export function registerAllCommands(app: App): void {
  registerHelpCommand(app);
  registerStatusCommand(app);
  registerMyReviewsCommand(app);
  registerMyPRsCommand(app);
  registerLinkUserCommand(app);
  registerNudgeCommand(app);
}
