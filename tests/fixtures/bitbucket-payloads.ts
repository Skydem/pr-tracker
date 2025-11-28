/**
 * Realistic Bitbucket Cloud webhook payloads based on actual API structure.
 * These fixtures mimic real-world data for comprehensive functional testing.
 */

import type {
  BitbucketWebhookPayload,
  BitbucketApprovalPayload,
  BitbucketChangesRequestPayload,
  BitbucketCommentPayload,
  BitbucketUser,
  BitbucketPullRequest,
} from "../../src/types/bitbucket.types.js";

// =============================================================================
// Test Users - Realistic Bitbucket users
// =============================================================================

export const testUsers = {
  author: {
    display_name: "John Developer",
    uuid: "{a1b2c3d4-e5f6-7890-abcd-ef1234567890}",
    nickname: "john_dev",
    type: "user",
    account_id: "5f7c8d9e0a1b2c3d4e5f6789",
  } as BitbucketUser,

  reviewer1: {
    display_name: "Sarah Reviewer",
    uuid: "{b2c3d4e5-f6a7-8901-bcde-f12345678901}",
    nickname: "sarah_review",
    type: "user",
    account_id: "5f7c8d9e0a1b2c3d4e5f6790",
  } as BitbucketUser,

  reviewer2: {
    display_name: "Mike Tech Lead",
    uuid: "{c3d4e5f6-a7b8-9012-cdef-123456789012}",
    nickname: "mike_techlead",
    type: "user",
    account_id: "5f7c8d9e0a1b2c3d4e5f6791",
  } as BitbucketUser,

  reviewer3: {
    display_name: "Emma Senior Dev",
    uuid: "{d4e5f6a7-b8c9-0123-defa-234567890123}",
    nickname: "emma_senior",
    type: "user",
    account_id: "5f7c8d9e0a1b2c3d4e5f6792",
  } as BitbucketUser,

  externalContributor: {
    display_name: "Alex External",
    uuid: "{e5f6a7b8-c9d0-1234-efab-345678901234}",
    nickname: "alex_ext",
    type: "user",
    account_id: "5f7c8d9e0a1b2c3d4e5f6793",
  } as BitbucketUser,
};

// =============================================================================
// Repository - Realistic Bitbucket repository
// =============================================================================

export const testRepository = {
  name: "backend-api",
  full_name: "acme-corp/backend-api",
  uuid: "{repo-uuid-1234-5678-9012-345678901234}",
  workspace: {
    slug: "acme-corp",
    name: "Acme Corporation",
    uuid: "{ws-uuid-1234-5678-9012-345678901234}",
  },
};

// =============================================================================
// Pull Request Templates
// =============================================================================

function createBasePullRequest(
  id: number,
  title: string,
  author: BitbucketUser,
  reviewers: BitbucketUser[],
  options: {
    state?: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED";
    sourceBranch?: string;
    destBranch?: string;
    description?: string;
  } = {}
): BitbucketPullRequest {
  return {
    id,
    title,
    description: options.description ?? `Implementation of ${title}`,
    state: options.state ?? "OPEN",
    source: {
      branch: { name: options.sourceBranch ?? `feature/PR-${id}` },
      repository: {
        name: testRepository.name,
        full_name: testRepository.full_name,
        uuid: testRepository.uuid,
        workspace: testRepository.workspace,
      },
    },
    destination: {
      branch: { name: options.destBranch ?? "main" },
      repository: {
        name: testRepository.name,
        full_name: testRepository.full_name,
        uuid: testRepository.uuid,
        workspace: testRepository.workspace,
      },
    },
    author,
    reviewers,
    links: {
      html: {
        href: `https://bitbucket.org/${testRepository.full_name}/pull-requests/${id}`,
      },
    },
    created_on: new Date().toISOString(),
    updated_on: new Date().toISOString(),
  };
}

// =============================================================================
// Webhook Payload Factories
// =============================================================================

/**
 * Creates a pullrequest:created webhook payload
 */
export function createPRCreatedPayload(
  prId: number,
  title: string,
  reviewers: BitbucketUser[] = [testUsers.reviewer1, testUsers.reviewer2]
): BitbucketWebhookPayload {
  return {
    actor: testUsers.author,
    repository: testRepository,
    pullrequest: createBasePullRequest(prId, title, testUsers.author, reviewers),
  };
}

/**
 * Creates a pullrequest:updated webhook payload
 */
export function createPRUpdatedPayload(
  prId: number,
  title: string,
  updatedBy: BitbucketUser = testUsers.author
): BitbucketWebhookPayload {
  return {
    actor: updatedBy,
    repository: testRepository,
    pullrequest: createBasePullRequest(prId, title, testUsers.author, [
      testUsers.reviewer1,
      testUsers.reviewer2,
    ]),
  };
}

/**
 * Creates a pullrequest:approved webhook payload
 */
export function createPRApprovedPayload(
  prId: number,
  title: string,
  approver: BitbucketUser
): BitbucketApprovalPayload {
  return {
    actor: approver,
    repository: testRepository,
    pullrequest: createBasePullRequest(prId, title, testUsers.author, [
      testUsers.reviewer1,
      testUsers.reviewer2,
    ]),
    approval: {
      date: new Date().toISOString(),
      user: approver,
    },
  };
}

/**
 * Creates a pullrequest:changes_request_created webhook payload
 */
export function createChangesRequestedPayload(
  prId: number,
  title: string,
  reviewer: BitbucketUser
): BitbucketChangesRequestPayload {
  return {
    actor: reviewer,
    repository: testRepository,
    pullrequest: createBasePullRequest(prId, title, testUsers.author, [
      testUsers.reviewer1,
      testUsers.reviewer2,
    ]),
    changes_request: {
      date: new Date().toISOString(),
      user: reviewer,
    },
  };
}

/**
 * Creates a pullrequest:comment_created webhook payload
 */
export function createCommentPayload(
  prId: number,
  title: string,
  commenter: BitbucketUser,
  commentContent: string = "Great work! Just a few minor suggestions."
): BitbucketCommentPayload {
  return {
    actor: commenter,
    repository: testRepository,
    pullrequest: createBasePullRequest(prId, title, testUsers.author, [
      testUsers.reviewer1,
      testUsers.reviewer2,
    ]),
    comment: {
      id: Math.floor(Math.random() * 1000000),
      content: {
        raw: commentContent,
        markup: "markdown",
        html: `<p>${commentContent}</p>`,
      },
      user: commenter,
      created_on: new Date().toISOString(),
    },
  };
}

/**
 * Creates a pullrequest:fulfilled (merged) webhook payload
 */
export function createPRMergedPayload(
  prId: number,
  title: string,
  mergedBy: BitbucketUser = testUsers.author
): BitbucketWebhookPayload {
  return {
    actor: mergedBy,
    repository: testRepository,
    pullrequest: createBasePullRequest(prId, title, testUsers.author, [], {
      state: "MERGED",
    }),
  };
}

/**
 * Creates a pullrequest:rejected (declined) webhook payload
 */
export function createPRDeclinedPayload(
  prId: number,
  title: string,
  declinedBy: BitbucketUser = testUsers.author
): BitbucketWebhookPayload {
  return {
    actor: declinedBy,
    repository: testRepository,
    pullrequest: createBasePullRequest(prId, title, testUsers.author, [], {
      state: "DECLINED",
    }),
  };
}

// =============================================================================
// Complex Scenario Payloads
// =============================================================================

/**
 * Scenario: Feature PR with multiple reviewers
 */
export const scenarioFeaturePR = {
  prId: 42,
  title: "Add user authentication module",
  sourceBranch: "feature/user-auth",
  destBranch: "develop",

  created: (): BitbucketWebhookPayload => ({
    actor: testUsers.author,
    repository: testRepository,
    pullrequest: createBasePullRequest(
      42,
      "Add user authentication module",
      testUsers.author,
      [testUsers.reviewer1, testUsers.reviewer2, testUsers.reviewer3],
      { sourceBranch: "feature/user-auth", destBranch: "develop" }
    ),
  }),

  reviewer1Approved: (): BitbucketApprovalPayload =>
    createPRApprovedPayload(42, "Add user authentication module", testUsers.reviewer1),

  reviewer2ChangesRequested: (): BitbucketChangesRequestPayload =>
    createChangesRequestedPayload(42, "Add user authentication module", testUsers.reviewer2),

  authorUpdated: (): BitbucketWebhookPayload =>
    createPRUpdatedPayload(42, "Add user authentication module"),

  reviewer2Approved: (): BitbucketApprovalPayload =>
    createPRApprovedPayload(42, "Add user authentication module", testUsers.reviewer2),

  reviewer3Approved: (): BitbucketApprovalPayload =>
    createPRApprovedPayload(42, "Add user authentication module", testUsers.reviewer3),

  merged: (): BitbucketWebhookPayload =>
    createPRMergedPayload(42, "Add user authentication module"),
};

/**
 * Scenario: Hotfix PR with single reviewer
 */
export const scenarioHotfixPR = {
  prId: 99,
  title: "Fix critical security vulnerability",
  sourceBranch: "hotfix/security-patch",
  destBranch: "main",

  created: (): BitbucketWebhookPayload => ({
    actor: testUsers.author,
    repository: testRepository,
    pullrequest: createBasePullRequest(
      99,
      "Fix critical security vulnerability",
      testUsers.author,
      [testUsers.reviewer2], // Only tech lead reviews hotfixes
      { sourceBranch: "hotfix/security-patch", destBranch: "main" }
    ),
  }),

  approved: (): BitbucketApprovalPayload =>
    createPRApprovedPayload(99, "Fix critical security vulnerability", testUsers.reviewer2),

  merged: (): BitbucketWebhookPayload =>
    createPRMergedPayload(99, "Fix critical security vulnerability"),
};

/**
 * Scenario: PR declined after discussion
 */
export const scenarioDeclinedPR = {
  prId: 77,
  title: "Refactor database layer",

  created: (): BitbucketWebhookPayload =>
    createPRCreatedPayload(77, "Refactor database layer", [testUsers.reviewer1]),

  comment1: (): BitbucketCommentPayload =>
    createCommentPayload(77, "Refactor database layer", testUsers.reviewer1,
      "This refactor is too risky for the current sprint. Let's discuss alternatives."),

  comment2: (): BitbucketCommentPayload =>
    createCommentPayload(77, "Refactor database layer", testUsers.author,
      "I understand. Let me close this and create smaller PRs instead."),

  declined: (): BitbucketWebhookPayload =>
    createPRDeclinedPayload(77, "Refactor database layer"),
};

/**
 * Scenario: PR with external contributor
 */
export const scenarioExternalContributorPR = {
  prId: 128,
  title: "Add new payment gateway integration",

  created: (): BitbucketWebhookPayload => ({
    actor: testUsers.externalContributor,
    repository: testRepository,
    pullrequest: createBasePullRequest(
      128,
      "Add new payment gateway integration",
      testUsers.externalContributor,
      [testUsers.reviewer1, testUsers.reviewer2],
      { sourceBranch: "feature/payment-gateway" }
    ),
  }),
};

// =============================================================================
// Database Mock Data (corresponding to webhooks)
// =============================================================================

export const mockDbUsers = {
  author: {
    id: "user-author-uuid",
    bitbucketUuid: testUsers.author.uuid,
    bitbucketEmail: "john.developer@acme.com",
    slackUserId: "U_JOHN_DEV",
    displayName: testUsers.author.display_name,
    notificationsMuted: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },

  reviewer1: {
    id: "user-reviewer1-uuid",
    bitbucketUuid: testUsers.reviewer1.uuid,
    bitbucketEmail: "sarah.reviewer@acme.com",
    slackUserId: "U_SARAH_REV",
    displayName: testUsers.reviewer1.display_name,
    notificationsMuted: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },

  reviewer2: {
    id: "user-reviewer2-uuid",
    bitbucketUuid: testUsers.reviewer2.uuid,
    bitbucketEmail: "mike.techlead@acme.com",
    slackUserId: "U_MIKE_TL",
    displayName: testUsers.reviewer2.display_name,
    notificationsMuted: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },

  reviewer3: {
    id: "user-reviewer3-uuid",
    bitbucketUuid: testUsers.reviewer3.uuid,
    bitbucketEmail: "emma.senior@acme.com",
    slackUserId: "U_EMMA_SR",
    displayName: testUsers.reviewer3.display_name,
    notificationsMuted: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },

  // User without Slack linked
  unlinkedUser: {
    id: "user-unlinked-uuid",
    bitbucketUuid: testUsers.externalContributor.uuid,
    bitbucketEmail: "alex.external@partner.com",
    slackUserId: null,
    displayName: testUsers.externalContributor.display_name,
    notificationsMuted: false,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
  },
};

export const mockDbPRs = {
  openPR: {
    id: "pr-42-uuid",
    bitbucketId: 42,
    repositorySlug: "backend-api",
    workspaceSlug: "acme-corp",
    title: "Add user authentication module",
    sourceBranch: "feature/user-auth",
    destBranch: "develop",
    state: "OPEN" as const,
    url: "https://bitbucket.org/acme-corp/backend-api/pull-requests/42",
    authorId: mockDbUsers.author.id,
    createdAt: new Date("2024-01-10"),
    updatedAt: new Date("2024-01-10"),
  },

  hotfixPR: {
    id: "pr-99-uuid",
    bitbucketId: 99,
    repositorySlug: "backend-api",
    workspaceSlug: "acme-corp",
    title: "Fix critical security vulnerability",
    sourceBranch: "hotfix/security-patch",
    destBranch: "main",
    state: "OPEN" as const,
    url: "https://bitbucket.org/acme-corp/backend-api/pull-requests/99",
    authorId: mockDbUsers.author.id,
    createdAt: new Date("2024-01-12"),
    updatedAt: new Date("2024-01-12"),
  },
};

export const mockDbReviewers = {
  // PR 42 reviewers
  pr42Reviewer1: {
    id: "reviewer-42-1-uuid",
    pullRequestId: mockDbPRs.openPR.id,
    userId: mockDbUsers.reviewer1.id,
    status: "PENDING" as const,
    updatedAt: new Date("2024-01-10"),
  },

  pr42Reviewer2: {
    id: "reviewer-42-2-uuid",
    pullRequestId: mockDbPRs.openPR.id,
    userId: mockDbUsers.reviewer2.id,
    status: "PENDING" as const,
    updatedAt: new Date("2024-01-10"),
  },

  pr42Reviewer3: {
    id: "reviewer-42-3-uuid",
    pullRequestId: mockDbPRs.openPR.id,
    userId: mockDbUsers.reviewer3.id,
    status: "PENDING" as const,
    updatedAt: new Date("2024-01-10"),
  },
};

/**
 * Creates a PRWithReviewers mock object for service tests
 */
export function createPRWithReviewers(
  pr: typeof mockDbPRs.openPR,
  author: typeof mockDbUsers.author,
  reviewers: Array<{
    reviewer: typeof mockDbReviewers.pr42Reviewer1;
    user: typeof mockDbUsers.reviewer1;
  }>
) {
  return {
    ...pr,
    author: {
      displayName: author.displayName,
      slackUserId: author.slackUserId,
    },
    reviewers: reviewers.map(({ reviewer, user }) => ({
      ...reviewer,
      user: {
        displayName: user.displayName,
        slackUserId: user.slackUserId,
      },
    })),
  };
}
