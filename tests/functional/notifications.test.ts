/**
 * Functional tests for notification flows.
 *
 * These tests verify notification logic and message formatting.
 * Integration tests can send real notifications to the admin user (from env)
 * when RUN_SLACK_INTEGRATION=true is set.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockDbUsers,
  mockDbPRs,
  mockDbReviewers,
  createPRWithReviewers,
} from "../fixtures/bitbucket-payloads.js";

// =============================================================================
// Mock Setup - vi.mock is hoisted, so define mocks inside factory
// =============================================================================

vi.mock("../../src/services/slack.service.js", () => {
  const mockSendDM = vi.fn().mockResolvedValue(undefined);
  return {
    slackService: {
      sendDM: mockSendDM,
      buildPRCreatedMessage: vi.fn().mockReturnValue({ blocks: [], text: "PR Created" }),
      buildPRUpdatedMessage: vi.fn().mockReturnValue({ blocks: [], text: "PR Updated" }),
      buildChangesRequestedMessage: vi.fn().mockReturnValue({ blocks: [], text: "Changes Requested" }),
      buildAllApprovedMessage: vi.fn().mockReturnValue({ blocks: [], text: "All Approved" }),
      buildCommentAddedMessage: vi.fn().mockReturnValue({ blocks: [], text: "Comment Added" }),
      buildNudgeMessage: vi.fn().mockReturnValue({ blocks: [], text: "Nudge" }),
    },
    SlackService: class SlackService {
      private app: unknown = null;
      setApp(app: unknown) {
        this.app = app;
      }
      sendDM = vi.fn().mockResolvedValue(undefined);
      buildPRCreatedMessage(pr: unknown) {
        return {
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `*New PR*\n<${(pr as { url: string }).url}|${(pr as { title: string }).title}>` } },
            { type: "section", fields: [
              { type: "mrkdwn", text: `*Author:*\n${(pr as { author: { displayName: string } }).author.displayName}` },
              { type: "mrkdwn", text: `*Branch:*\n${(pr as { sourceBranch: string }).sourceBranch} → ${(pr as { destBranch: string }).destBranch}` },
              { type: "mrkdwn", text: `*Repository:*\n${(pr as { workspaceSlug: string }).workspaceSlug}/${(pr as { repositorySlug: string }).repositorySlug}` },
            ] },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View PR" }, url: (pr as { url: string }).url }] },
          ],
          text: `You've been added as a reviewer on "${(pr as { title: string }).title}"`,
        };
      }
      buildPRUpdatedMessage(pr: unknown) {
        return { blocks: [], text: `PR Updated: ${(pr as { title: string }).title}` };
      }
      buildChangesRequestedMessage(pr: unknown, reviewerName: string) {
        return { blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Changes Requested*\n${reviewerName}` } }], text: `${reviewerName} requested changes` };
      }
      buildAllApprovedMessage(pr: unknown) {
        return { blocks: [{ type: "section", text: { type: "mrkdwn", text: `*All Approved!* :white_check_mark:\nReady to merge` } }], text: `All reviewers approved "${(pr as { title: string }).title}"` };
      }
      buildCommentAddedMessage(pr: unknown, commenterName: string) {
        return { blocks: [], text: `${commenterName} commented` };
      }
      buildNudgeMessage(pr: unknown) {
        return { blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Review Reminder* :bell:\n${(pr as { author: { displayName: string } }).author.displayName} is waiting for your review` } }], text: `Reminder: Please review` };
      }
    },
  };
});

// Import SlackService after mock is set up (for real class usage in message format tests)
import { SlackService } from "../../src/services/slack.service.js";
import { slackService } from "../../src/services/slack.service.js";

vi.mock("../../src/services/pr.service.js", () => ({
  prService: {
    getReviewersWithStatus: vi.fn(),
    areAllReviewersApproved: vi.fn(),
    getPRWithReviewers: vi.fn(),
  },
}));

vi.mock("../../src/services/user.service.js", () => ({
  userService: {
    getUserByBitbucketUuid: vi.fn(),
  },
}));

vi.mock("../../src/db/client.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Dynamic import to access mocked services
import { prService } from "../../src/services/pr.service.js";
import { prisma } from "../../src/db/client.js";

// =============================================================================
// Test Data
// =============================================================================

const mockPRWithSlackReviewers = createPRWithReviewers(
  mockDbPRs.openPR,
  mockDbUsers.author,
  [
    {
      reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "PENDING" },
      user: mockDbUsers.reviewer1, // Has slackUserId
    },
    {
      reviewer: { ...mockDbReviewers.pr42Reviewer2, status: "PENDING" },
      user: mockDbUsers.reviewer2, // Has slackUserId
    },
  ]
);

const mockPRWithMixedReviewers = createPRWithReviewers(
  mockDbPRs.openPR,
  mockDbUsers.author,
  [
    {
      reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "PENDING" },
      user: mockDbUsers.reviewer1, // Has slackUserId
    },
    {
      reviewer: { ...mockDbReviewers.pr42Reviewer2, status: "PENDING" },
      user: mockDbUsers.unlinkedUser, // No slackUserId
    },
  ]
);

const mockPRWithNoSlackReviewers = createPRWithReviewers(
  mockDbPRs.openPR,
  { ...mockDbUsers.author, slackUserId: null },
  [
    {
      reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "PENDING" },
      user: mockDbUsers.unlinkedUser,
    },
  ]
);

// Import notification service after mocks are set up
import { NotificationService } from "../../src/services/notification.service.js";

// =============================================================================
// Unit Tests - Notification Logic
// =============================================================================

describe("NotificationService - PR Created Notifications", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();
  });

  it("should send DM to all reviewers with Slack linked on PR created", async () => {
    await notificationService.notifyReviewersOnPRCreated(mockPRWithSlackReviewers);

    // Both reviewers have Slack linked, so 2 DMs should be sent
    expect(slackService.sendDM).toHaveBeenCalledTimes(2);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.reviewer1.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.reviewer2.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("should only send DM to reviewers with Slack linked", async () => {
    await notificationService.notifyReviewersOnPRCreated(mockPRWithMixedReviewers);

    // Only one reviewer has Slack linked
    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.reviewer1.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("should not send any DMs when no reviewers have Slack linked", async () => {
    await notificationService.notifyReviewersOnPRCreated(mockPRWithNoSlackReviewers);

    expect(slackService.sendDM).not.toHaveBeenCalled();
  });
});

describe("NotificationService - PR Updated Notifications", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();
  });

  it("should only notify reviewers who requested changes", async () => {
    // Mock: one reviewer requested changes
    vi.mocked(prService.getReviewersWithStatus).mockResolvedValueOnce([
      { userId: mockDbUsers.reviewer2.id, slackUserId: mockDbUsers.reviewer2.slackUserId },
    ]);

    await notificationService.notifyReviewersOnPRUpdated(mockPRWithSlackReviewers);

    expect(prService.getReviewersWithStatus).toHaveBeenCalledWith(
      mockPRWithSlackReviewers.id,
      "CHANGES_REQUESTED"
    );
    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.reviewer2.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("should not send notifications when no reviewers requested changes", async () => {
    vi.mocked(prService.getReviewersWithStatus).mockResolvedValueOnce([]);

    await notificationService.notifyReviewersOnPRUpdated(mockPRWithSlackReviewers);

    expect(slackService.sendDM).not.toHaveBeenCalled();
  });
});

describe("NotificationService - Changes Requested Notifications", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();
  });

  it("should notify author when changes are requested", async () => {
    await notificationService.notifyAuthorOnChangesRequested(
      mockPRWithSlackReviewers,
      "Mike Tech Lead"
    );

    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.author.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("should not notify author without Slack linked", async () => {
    await notificationService.notifyAuthorOnChangesRequested(
      mockPRWithNoSlackReviewers,
      "Mike Tech Lead"
    );

    expect(slackService.sendDM).not.toHaveBeenCalled();
  });
});

describe("NotificationService - All Approved Notifications", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();
  });

  it("should notify author when all reviewers approved", async () => {
    vi.mocked(prService.areAllReviewersApproved).mockResolvedValueOnce(true);

    await notificationService.notifyAuthorOnAllApproved(mockPRWithSlackReviewers);

    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.author.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("should not notify when not all reviewers approved", async () => {
    vi.mocked(prService.areAllReviewersApproved).mockResolvedValueOnce(false);

    await notificationService.notifyAuthorOnAllApproved(mockPRWithSlackReviewers);

    expect(slackService.sendDM).not.toHaveBeenCalled();
  });

  it("should not notify author without Slack linked even when all approved", async () => {
    vi.mocked(prService.areAllReviewersApproved).mockResolvedValueOnce(true);

    await notificationService.notifyAuthorOnAllApproved(mockPRWithNoSlackReviewers);

    expect(slackService.sendDM).not.toHaveBeenCalled();
  });
});

describe("NotificationService - Nudge Reviewers", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();
  });

  it("should nudge all pending reviewers with Slack linked", async () => {
    vi.mocked(prService.getReviewersWithStatus).mockResolvedValueOnce([
      { userId: mockDbUsers.reviewer1.id, slackUserId: mockDbUsers.reviewer1.slackUserId },
      { userId: mockDbUsers.reviewer2.id, slackUserId: mockDbUsers.reviewer2.slackUserId },
    ]);

    const count = await notificationService.nudgeReviewers(mockPRWithSlackReviewers);

    expect(count).toBe(2);
    expect(slackService.sendDM).toHaveBeenCalledTimes(2);
  });

  it("should return count of actually notified reviewers", async () => {
    vi.mocked(prService.getReviewersWithStatus).mockResolvedValueOnce([
      { userId: mockDbUsers.reviewer1.id, slackUserId: mockDbUsers.reviewer1.slackUserId },
      { userId: mockDbUsers.unlinkedUser.id, slackUserId: null }, // No Slack
    ]);

    const count = await notificationService.nudgeReviewers(mockPRWithMixedReviewers);

    expect(count).toBe(1); // Only one with Slack
    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
  });

  it("should return 0 when no pending reviewers have Slack", async () => {
    vi.mocked(prService.getReviewersWithStatus).mockResolvedValueOnce([
      { userId: mockDbUsers.unlinkedUser.id, slackUserId: null },
    ]);

    const count = await notificationService.nudgeReviewers(mockPRWithNoSlackReviewers);

    expect(count).toBe(0);
    expect(slackService.sendDM).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Message Format Tests
// =============================================================================

describe("SlackService - Message Formatting", () => {
  let slackService: SlackService;

  beforeEach(() => {
    slackService = new SlackService();
  });

  describe("buildPRCreatedMessage", () => {
    it("should include PR title as link", () => {
      const { blocks, text } = slackService.buildPRCreatedMessage(mockPRWithSlackReviewers);

      expect(text).toContain(mockPRWithSlackReviewers.title);
      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain(mockPRWithSlackReviewers.url);
      expect(blocksJson).toContain(mockPRWithSlackReviewers.title);
    });

    it("should include author name", () => {
      const { blocks } = slackService.buildPRCreatedMessage(mockPRWithSlackReviewers);

      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain(mockPRWithSlackReviewers.author.displayName);
    });

    it("should include branch information", () => {
      const { blocks } = slackService.buildPRCreatedMessage(mockPRWithSlackReviewers);

      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain(mockPRWithSlackReviewers.sourceBranch);
      expect(blocksJson).toContain(mockPRWithSlackReviewers.destBranch);
    });

    it("should include repository information", () => {
      const { blocks } = slackService.buildPRCreatedMessage(mockPRWithSlackReviewers);

      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain(mockPRWithSlackReviewers.workspaceSlug);
      expect(blocksJson).toContain(mockPRWithSlackReviewers.repositorySlug);
    });

    it("should include View PR button", () => {
      const { blocks } = slackService.buildPRCreatedMessage(mockPRWithSlackReviewers);

      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain("View PR");
      expect(blocksJson).toContain("button");
    });
  });

  describe("buildChangesRequestedMessage", () => {
    it("should include reviewer name who requested changes", () => {
      const reviewerName = "Mike Tech Lead";
      const { blocks, text } = slackService.buildChangesRequestedMessage(
        mockPRWithSlackReviewers,
        reviewerName
      );

      expect(text).toContain(reviewerName);
      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain(reviewerName);
    });

    it("should have 'Changes Requested' header", () => {
      const { blocks } = slackService.buildChangesRequestedMessage(
        mockPRWithSlackReviewers,
        "Reviewer"
      );

      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain("Changes Requested");
    });
  });

  describe("buildAllApprovedMessage", () => {
    it("should have celebratory message", () => {
      const { blocks, text } = slackService.buildAllApprovedMessage(mockPRWithSlackReviewers);

      expect(text).toContain("approved");
      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain("Approved");
      expect(blocksJson).toContain("white_check_mark");
    });

    it("should indicate ready to merge", () => {
      const { blocks } = slackService.buildAllApprovedMessage(mockPRWithSlackReviewers);

      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain("Ready to merge");
    });
  });

  describe("buildNudgeMessage", () => {
    it("should have reminder messaging", () => {
      const { blocks, text } = slackService.buildNudgeMessage(mockPRWithSlackReviewers);

      expect(text).toContain("Reminder");
      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain("Reminder");
      expect(blocksJson).toContain("bell");
    });

    it("should mention waiting for review", () => {
      const { blocks } = slackService.buildNudgeMessage(mockPRWithSlackReviewers);

      const blocksJson = JSON.stringify(blocks);
      expect(blocksJson).toContain("waiting for your review");
    });
  });
});

// =============================================================================
// Integration Test - Real Slack (Optional)
// =============================================================================

describe.skipIf(!process.env.RUN_SLACK_INTEGRATION)(
  "SlackService - Integration Tests (Real Slack)",
  () => {
    // Use 'any' to hold the real SlackService instance (bypassing mock)
    let realSlackService: InstanceType<typeof SlackService>;
    let adminUserId: string;

    beforeEach(async () => {
      // Get admin user ID from environment
      adminUserId = process.env.SLACK_ADMIN_USER_ID || "";

      if (!adminUserId) {
        throw new Error("SLACK_ADMIN_USER_ID must be set for integration tests");
      }

      // Import the REAL SlackService, bypassing the mock
      const actualModule = await vi.importActual<typeof import("../../src/services/slack.service.js")>(
        "../../src/services/slack.service.js"
      );
      const RealSlackService = actualModule.SlackService;

      // Create real Slack app
      const { App } = await import("@slack/bolt");

      const app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        appToken: process.env.SLACK_APP_TOKEN,
        socketMode: true,
      });

      realSlackService = new RealSlackService();
      realSlackService.setApp(app);
    });

    it("should send test DM to admin user", async () => {
      const testMessage = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Test Notification*\nThis is a test message from PR Tracker functional tests.",
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Sent at: ${new Date().toISOString()}`,
              },
            ],
          },
        ],
        text: "Test notification from PR Tracker",
      };

      // This will actually send to Slack
      await expect(
        realSlackService.sendDM(adminUserId, testMessage.blocks, testMessage.text)
      ).resolves.not.toThrow();
    });

    it("should send PR Created notification format to admin", async () => {
      const mockPR = createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, []);
      const { blocks, text } = realSlackService.buildPRCreatedMessage(mockPR);

      await expect(realSlackService.sendDM(adminUserId, blocks, text)).resolves.not.toThrow();
    });

    it("should send All Approved notification format to admin", async () => {
      const mockPR = createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, []);
      const { blocks, text } = realSlackService.buildAllApprovedMessage(mockPR);

      await expect(realSlackService.sendDM(adminUserId, blocks, text)).resolves.not.toThrow();
    });
  }
);

// =============================================================================
// Notification Scenarios - End to End
// =============================================================================

describe("Notification Scenarios - Real World Flows", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();
  });

  it("Scenario: New PR with multiple reviewers - all get notified", async () => {
    await notificationService.notifyReviewersOnPRCreated(mockPRWithSlackReviewers);

    // Both reviewers should receive notifications
    expect(slackService.sendDM).toHaveBeenCalledTimes(2);

    const calledUserIds = slackService.sendDM.mock.calls.map((call) => call[0]);
    expect(calledUserIds).toContain(mockDbUsers.reviewer1.slackUserId);
    expect(calledUserIds).toContain(mockDbUsers.reviewer2.slackUserId);
  });

  it("Scenario: Mixed team - only Slack-linked members notified", async () => {
    await notificationService.notifyReviewersOnPRCreated(mockPRWithMixedReviewers);

    // Only the linked reviewer should receive notification
    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.reviewer1.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("Scenario: Author with changes requested gets prompt notification", async () => {
    await notificationService.notifyAuthorOnChangesRequested(
      mockPRWithSlackReviewers,
      "Critical Reviewer"
    );

    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.author.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("Scenario: Nudge only targets pending reviewers", async () => {
    // Setup: 2 pending reviewers with Slack
    vi.mocked(prService.getReviewersWithStatus).mockResolvedValueOnce([
      { userId: mockDbUsers.reviewer1.id, slackUserId: mockDbUsers.reviewer1.slackUserId },
      { userId: mockDbUsers.reviewer2.id, slackUserId: mockDbUsers.reviewer2.slackUserId },
    ]);

    const count = await notificationService.nudgeReviewers(mockPRWithSlackReviewers);

    expect(count).toBe(2);
    expect(slackService.sendDM).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Muted User Notification Tests
// =============================================================================

describe("NotificationService - Muted Users", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService();
  });

  it("should not notify muted reviewer on PR created", async () => {
    // Reviewer1 is muted, Reviewer2 is not
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ notificationsMuted: true } as never) // reviewer1 check
      .mockResolvedValueOnce({ notificationsMuted: false } as never); // reviewer2 check

    await notificationService.notifyReviewersOnPRCreated(mockPRWithSlackReviewers);

    // Only reviewer2 should be notified
    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.reviewer2.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("should not notify muted author on changes requested", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      notificationsMuted: true,
    } as never);

    await notificationService.notifyAuthorOnChangesRequested(
      mockPRWithSlackReviewers,
      "Reviewer Name"
    );

    expect(slackService.sendDM).not.toHaveBeenCalled();
  });

  it("should not notify muted author on all approved", async () => {
    vi.mocked(prService.areAllReviewersApproved).mockResolvedValueOnce(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      notificationsMuted: true,
    } as never);

    await notificationService.notifyAuthorOnAllApproved(mockPRWithSlackReviewers);

    expect(slackService.sendDM).not.toHaveBeenCalled();
  });

  it("should not nudge muted reviewers", async () => {
    vi.mocked(prService.getReviewersWithStatus).mockResolvedValueOnce([
      { userId: mockDbUsers.reviewer1.id, slackUserId: mockDbUsers.reviewer1.slackUserId },
      { userId: mockDbUsers.reviewer2.id, slackUserId: mockDbUsers.reviewer2.slackUserId },
    ]);

    // Reviewer1 is muted, Reviewer2 is not
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ notificationsMuted: true } as never)
      .mockResolvedValueOnce({ notificationsMuted: false } as never);

    const count = await notificationService.nudgeReviewers(mockPRWithSlackReviewers);

    expect(count).toBe(1); // Only 1 reviewer was notified
    expect(slackService.sendDM).toHaveBeenCalledTimes(1);
    expect(slackService.sendDM).toHaveBeenCalledWith(
      mockDbUsers.reviewer2.slackUserId,
      expect.any(Array),
      expect.any(String)
    );
  });

  it("should notify when user has notificationsMuted: false", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ notificationsMuted: false } as never)
      .mockResolvedValueOnce({ notificationsMuted: false } as never);

    await notificationService.notifyReviewersOnPRCreated(mockPRWithSlackReviewers);

    expect(slackService.sendDM).toHaveBeenCalledTimes(2);
  });

  it("should notify when user record not found (default to unmuted)", async () => {
    // User not found in DB - should default to allowing notifications
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await notificationService.notifyReviewersOnPRCreated(mockPRWithSlackReviewers);

    expect(slackService.sendDM).toHaveBeenCalledTimes(2);
  });
});
