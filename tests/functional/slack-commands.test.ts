/**
 * Functional tests for Slack slash commands.
 * Tests all /pr subcommands with realistic scenarios.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../src/db/client.js";
import type { SlackCommandMiddlewareArgs, App } from "@slack/bolt";
import {
  mockDbUsers,
  mockDbPRs,
  mockDbReviewers,
  createPRWithReviewers,
} from "../fixtures/bitbucket-payloads.js";

// =============================================================================
// Mock Setup
// =============================================================================

vi.mock("../../src/services/pr.service.js", () => ({
  prService: {
    getPRByBitbucketId: vi.fn(),
    getPRsAwaitingReview: vi.fn(),
    getUserPRs: vi.fn(),
    getReviewersWithStatus: vi.fn(),
  },
}));

vi.mock("../../src/services/user.service.js", () => ({
  userService: {
    getUserBySlackId: vi.fn(),
    linkSlackUser: vi.fn(),
  },
}));

vi.mock("../../src/services/notification.service.js", () => ({
  notificationService: {
    nudgeReviewers: vi.fn(),
  },
}));

import { prService } from "../../src/services/pr.service.js";
import { userService } from "../../src/services/user.service.js";
import { notificationService } from "../../src/services/notification.service.js";
import { registerStatusCommand } from "../../src/commands/status.command.js";
import { registerMyReviewsCommand } from "../../src/commands/my-reviews.command.js";
import { registerMyPRsCommand } from "../../src/commands/my-prs.command.js";
import { registerLinkUserCommand } from "../../src/commands/link-user.command.js";
import { registerNudgeCommand } from "../../src/commands/nudge.command.js";
import { registerHelpCommand } from "../../src/commands/help.command.js";

// =============================================================================
// Test Helpers
// =============================================================================

interface MockSlackCommand {
  text: string;
  user_id: string;
  channel_id: string;
  team_id: string;
  command: string;
}

function createMockSlackContext(commandText: string, userId: string = "U_TEST_USER") {
  const ack = vi.fn().mockResolvedValue(undefined);
  const respond = vi.fn().mockResolvedValue(undefined);

  const command: MockSlackCommand = {
    text: commandText,
    user_id: userId,
    channel_id: "C_TEST_CHANNEL",
    team_id: "T_TEST_TEAM",
    command: "/pr",
  };

  return {
    command,
    ack,
    respond,
    context: { botUserId: "B_BOT" },
  } as unknown as SlackCommandMiddlewareArgs;
}

function createMockApp() {
  const handlers: Array<(args: SlackCommandMiddlewareArgs) => Promise<void>> = [];

  const app = {
    command: vi.fn().mockImplementation((_cmd: string, handler: (args: SlackCommandMiddlewareArgs) => Promise<void>) => {
      handlers.push(handler);
    }),
  } as unknown as App;

  return {
    app,
    handlers,
    async runCommand(text: string, userId?: string) {
      const ctx = createMockSlackContext(text, userId);
      for (const handler of handlers) {
        await handler(ctx);
      }
      return ctx;
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("Slack Commands - /pr status", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerStatusCommand(mockApp.app);
  });

  it("should show PR status with reviewer information", async () => {
    const mockPR = createPRWithReviewers(
      mockDbPRs.openPR,
      mockDbUsers.author,
      [
        {
          reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" },
          user: mockDbUsers.reviewer1,
        },
        {
          reviewer: { ...mockDbReviewers.pr42Reviewer2, status: "PENDING" },
          user: mockDbUsers.reviewer2,
        },
      ]
    );

    vi.mocked(prService.getPRByBitbucketId).mockResolvedValueOnce(mockPR);

    const ctx = await mockApp.runCommand("status acme-corp/backend-api/42");

    expect(ctx.ack).toHaveBeenCalled();
    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        response_type: "ephemeral",
        text: expect.stringContaining("PR Status"),
      })
    );

    // Verify blocks contain reviewer info
    const respondCall = vi.mocked(ctx.respond).mock.calls[0][0] as { blocks: Array<{ type: string; text?: { text?: string } }> };
    const blocksJson = JSON.stringify(respondCall.blocks);
    expect(blocksJson).toContain("Sarah Reviewer");
    expect(blocksJson).toContain("Mike Tech Lead");
    expect(blocksJson).toContain("APPROVED");
    expect(blocksJson).toContain("PENDING");
  });

  it("should show error for invalid PR identifier format", async () => {
    const ctx = await mockApp.runCommand("status invalid-format");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Invalid format"),
      })
    );
  });

  it("should show error when PR not found", async () => {
    vi.mocked(prService.getPRByBitbucketId).mockResolvedValueOnce(null);

    const ctx = await mockApp.runCommand("status acme-corp/backend-api/999");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("PR not found"),
      })
    );
  });

  it("should show usage when no identifier provided", async () => {
    const ctx = await mockApp.runCommand("status");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Usage"),
      })
    );
  });

  it("should show error for non-numeric PR ID", async () => {
    const ctx = await mockApp.runCommand("status acme-corp/backend-api/abc");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Invalid PR ID"),
      })
    );
  });
});

describe("Slack Commands - /pr my-reviews", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerMyReviewsCommand(mockApp.app);
  });

  it("should show PRs awaiting review", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.reviewer1);

    const mockPRs = [
      createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, [
        { reviewer: mockDbReviewers.pr42Reviewer1, user: mockDbUsers.reviewer1 },
      ]),
      createPRWithReviewers(mockDbPRs.hotfixPR, mockDbUsers.author, [
        { reviewer: { ...mockDbReviewers.pr42Reviewer1, pullRequestId: mockDbPRs.hotfixPR.id }, user: mockDbUsers.reviewer1 },
      ]),
    ];

    vi.mocked(prService.getPRsAwaitingReview).mockResolvedValueOnce(mockPRs);

    const ctx = await mockApp.runCommand("my-reviews", mockDbUsers.reviewer1.slackUserId!);

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("2 PRs awaiting review"),
      })
    );

    // Verify blocks show PR titles
    const respondCall = vi.mocked(ctx.respond).mock.calls[0][0] as { blocks: object[] };
    const blocksJson = JSON.stringify(respondCall.blocks);
    expect(blocksJson).toContain("Add user authentication module");
    expect(blocksJson).toContain("Fix critical security vulnerability");
  });

  it("should show celebration message when no PRs await review", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.reviewer1);
    vi.mocked(prService.getPRsAwaitingReview).mockResolvedValueOnce([]);

    const ctx = await mockApp.runCommand("my-reviews", mockDbUsers.reviewer1.slackUserId!);

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("No PRs awaiting your review"),
      })
    );
  });

  it("should prompt to link account when user not found", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(null);

    const ctx = await mockApp.runCommand("my-reviews", "U_UNKNOWN");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("haven't linked"),
      })
    );
  });
});

describe("Slack Commands - /pr my-prs", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerMyPRsCommand(mockApp.app);
  });

  it("should show user's open PRs with review status", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.author);

    const mockPRs = [
      createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, [
        { reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" }, user: mockDbUsers.reviewer1 },
        { reviewer: { ...mockDbReviewers.pr42Reviewer2, status: "PENDING" }, user: mockDbUsers.reviewer2 },
      ]),
    ];

    vi.mocked(prService.getUserPRs).mockResolvedValueOnce(mockPRs);

    const ctx = await mockApp.runCommand("my-prs", mockDbUsers.author.slackUserId!);

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("1 open PRs"),
      })
    );

    // Verify status indicators are shown
    const respondCall = vi.mocked(ctx.respond).mock.calls[0][0] as { blocks: object[] };
    const blocksJson = JSON.stringify(respondCall.blocks);
    expect(blocksJson).toContain("pending");
  });

  it("should show 'All approved!' when all reviewers approved", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.author);

    const mockPRs = [
      createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, [
        { reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" }, user: mockDbUsers.reviewer1 },
        { reviewer: { ...mockDbReviewers.pr42Reviewer2, status: "APPROVED" }, user: mockDbUsers.reviewer2 },
      ]),
    ];

    vi.mocked(prService.getUserPRs).mockResolvedValueOnce(mockPRs);

    const ctx = await mockApp.runCommand("my-prs", mockDbUsers.author.slackUserId!);

    const respondCall = vi.mocked(ctx.respond).mock.calls[0][0] as { blocks: object[] };
    const blocksJson = JSON.stringify(respondCall.blocks);
    expect(blocksJson).toContain("All approved!");
  });

  it("should show changes requested status prominently", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.author);

    const mockPRs = [
      createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, [
        { reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "APPROVED" }, user: mockDbUsers.reviewer1 },
        { reviewer: { ...mockDbReviewers.pr42Reviewer2, status: "CHANGES_REQUESTED" }, user: mockDbUsers.reviewer2 },
      ]),
    ];

    vi.mocked(prService.getUserPRs).mockResolvedValueOnce(mockPRs);

    const ctx = await mockApp.runCommand("my-prs", mockDbUsers.author.slackUserId!);

    const respondCall = vi.mocked(ctx.respond).mock.calls[0][0] as { blocks: object[] };
    const blocksJson = JSON.stringify(respondCall.blocks);
    expect(blocksJson).toContain("requested changes");
  });

  it("should show message when user has no open PRs", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.author);
    vi.mocked(prService.getUserPRs).mockResolvedValueOnce([]);

    const ctx = await mockApp.runCommand("my-prs", mockDbUsers.author.slackUserId!);

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("don't have any open PRs"),
      })
    );
  });
});

describe("Slack Commands - /pr link", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerLinkUserCommand(mockApp.app);
  });

  it("should successfully link a new user", async () => {
    // No existing link for this Slack user
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // slackUserId lookup
      .mockResolvedValueOnce(null); // email lookup

    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: "new-user-id",
      bitbucketUuid: null,
      bitbucketEmail: "john@acme.com",
      slackUserId: "U_NEW_USER",
      displayName: "john",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = await mockApp.runCommand("link john@acme.com", "U_NEW_USER");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Successfully linked"),
      })
    );
  });

  it("should link existing Bitbucket user to Slack", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // No existing Slack link
      .mockResolvedValueOnce({
        ...mockDbUsers.author,
        slackUserId: null, // Existing user but no Slack link yet
      });

    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      ...mockDbUsers.author,
      slackUserId: "U_NEW_LINK",
    });

    const ctx = await mockApp.runCommand("link john.developer@acme.com", "U_NEW_LINK");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Successfully linked"),
      })
    );
  });

  it("should reject if Slack user already linked", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockDbUsers.author);

    const ctx = await mockApp.runCommand("link other@acme.com", mockDbUsers.author.slackUserId!);

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("already linked"),
      })
    );
  });

  it("should reject if email already linked to different Slack user", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // Slack user not linked
      .mockResolvedValueOnce({
        ...mockDbUsers.author,
        slackUserId: "U_OTHER_USER", // Email linked to different Slack user
      });

    const ctx = await mockApp.runCommand("link john.developer@acme.com", "U_NEW_USER");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("already linked to another Slack account"),
      })
    );
  });

  it("should reject invalid email format", async () => {
    const ctx = await mockApp.runCommand("link not-an-email");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("valid email"),
      })
    );
  });

  it("should show usage when no email provided", async () => {
    const ctx = await mockApp.runCommand("link");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Usage"),
      })
    );
  });
});

describe("Slack Commands - /pr nudge", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerNudgeCommand(mockApp.app);
  });

  it("should nudge pending reviewers", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.author);

    const mockPR = createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, [
      { reviewer: { ...mockDbReviewers.pr42Reviewer1, status: "PENDING" }, user: mockDbUsers.reviewer1 },
      { reviewer: { ...mockDbReviewers.pr42Reviewer2, status: "PENDING" }, user: mockDbUsers.reviewer2 },
    ]);

    vi.mocked(prService.getPRByBitbucketId).mockResolvedValueOnce(mockPR);
    vi.mocked(notificationService.nudgeReviewers).mockResolvedValueOnce(2);

    const ctx = await mockApp.runCommand("nudge acme-corp/backend-api/42", mockDbUsers.author.slackUserId!);

    expect(notificationService.nudgeReviewers).toHaveBeenCalledWith(mockPR);
    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("2 reviewers"),
      })
    );
  });

  it("should show message when no reviewers to nudge", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.author);

    const mockPR = createPRWithReviewers(mockDbPRs.openPR, mockDbUsers.author, []);

    vi.mocked(prService.getPRByBitbucketId).mockResolvedValueOnce(mockPR);
    vi.mocked(notificationService.nudgeReviewers).mockResolvedValueOnce(0);

    const ctx = await mockApp.runCommand("nudge acme-corp/backend-api/42", mockDbUsers.author.slackUserId!);

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("No pending reviewers"),
      })
    );
  });

  it("should require linked account to nudge", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(null);

    const ctx = await mockApp.runCommand("nudge acme-corp/backend-api/42", "U_UNKNOWN");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("haven't linked"),
      })
    );
    expect(notificationService.nudgeReviewers).not.toHaveBeenCalled();
  });
});

describe("Slack Commands - /pr help", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerHelpCommand(mockApp.app);
  });

  it("should show help message with all commands", async () => {
    const ctx = await mockApp.runCommand("help");

    expect(ctx.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        response_type: "ephemeral",
      })
    );

    const respondCall = vi.mocked(ctx.respond).mock.calls[0][0] as { blocks: object[] };
    const blocksJson = JSON.stringify(respondCall.blocks);

    // Verify all commands are documented
    expect(blocksJson).toContain("status");
    expect(blocksJson).toContain("my-reviews");
    expect(blocksJson).toContain("my-prs");
    expect(blocksJson).toContain("link");
    expect(blocksJson).toContain("nudge");
  });

  it("should show help when running /pr with no subcommand", async () => {
    const ctx = await mockApp.runCommand("");

    expect(ctx.respond).toHaveBeenCalled();
  });
});

describe("Slack Commands - Edge Cases", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerStatusCommand(mockApp.app);
    registerMyReviewsCommand(mockApp.app);
  });

  it("should handle unknown subcommand gracefully", async () => {
    // Commands should not process unknown subcommands
    const ctx = await mockApp.runCommand("unknown-command");

    // Each handler returns early for unknown subcommands
    // The help command would normally handle this
    expect(ctx.ack).not.toHaveBeenCalled(); // No handler processed it
  });

  it("should handle command with extra whitespace", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.reviewer1);
    vi.mocked(prService.getPRsAwaitingReview).mockResolvedValueOnce([]);

    const ctx = await mockApp.runCommand("  my-reviews  ", mockDbUsers.reviewer1.slackUserId!);

    expect(ctx.ack).toHaveBeenCalled();
    expect(prService.getPRsAwaitingReview).toHaveBeenCalled();
  });

  it("should handle case-insensitive subcommands", async () => {
    vi.mocked(userService.getUserBySlackId).mockResolvedValueOnce(mockDbUsers.reviewer1);
    vi.mocked(prService.getPRsAwaitingReview).mockResolvedValueOnce([]);

    const ctx = await mockApp.runCommand("MY-REVIEWS", mockDbUsers.reviewer1.slackUserId!);

    expect(ctx.ack).toHaveBeenCalled();
    expect(prService.getPRsAwaitingReview).toHaveBeenCalled();
  });

  it("should handle service errors gracefully", async () => {
    vi.mocked(userService.getUserBySlackId).mockRejectedValueOnce(new Error("Database error"));

    // The error should propagate up (commands don't have try/catch)
    await expect(mockApp.runCommand("my-reviews")).rejects.toThrow("Database error");
  });
});

describe("Slack Commands - PR with Multiple Status Combinations", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    registerStatusCommand(mockApp.app);
  });

  const testCases = [
    {
      name: "all pending",
      reviewers: [
        { status: "PENDING" as const },
        { status: "PENDING" as const },
      ],
      expectedEmojis: [":hourglass:", ":hourglass:"],
    },
    {
      name: "mixed approved and pending",
      reviewers: [
        { status: "APPROVED" as const },
        { status: "PENDING" as const },
      ],
      expectedEmojis: [":white_check_mark:", ":hourglass:"],
    },
    {
      name: "changes requested",
      reviewers: [
        { status: "CHANGES_REQUESTED" as const },
      ],
      expectedEmojis: [":x:"],
    },
    {
      name: "all approved",
      reviewers: [
        { status: "APPROVED" as const },
        { status: "APPROVED" as const },
        { status: "APPROVED" as const },
      ],
      expectedEmojis: [":white_check_mark:", ":white_check_mark:", ":white_check_mark:"],
    },
  ];

  testCases.forEach(({ name, reviewers, expectedEmojis }) => {
    it(`should display correct status emojis for ${name}`, async () => {
      const mockPR = createPRWithReviewers(
        mockDbPRs.openPR,
        mockDbUsers.author,
        reviewers.map((r, i) => ({
          reviewer: { ...mockDbReviewers.pr42Reviewer1, id: `r-${i}`, status: r.status },
          user: { ...mockDbUsers.reviewer1, id: `u-${i}`, displayName: `Reviewer ${i}` },
        }))
      );

      vi.mocked(prService.getPRByBitbucketId).mockResolvedValueOnce(mockPR);

      const ctx = await mockApp.runCommand("status acme-corp/backend-api/42");

      const respondCall = vi.mocked(ctx.respond).mock.calls[0][0] as { blocks: object[] };
      const blocksJson = JSON.stringify(respondCall.blocks);

      expectedEmojis.forEach((emoji) => {
        expect(blocksJson).toContain(emoji);
      });
    });
  });
});
