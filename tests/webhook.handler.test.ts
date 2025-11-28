import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBitbucketWebhookRouter } from "../src/webhooks/bitbucket.handler.js";
import type { Request, Response } from "express";

vi.mock("../src/config/env.js", () => ({
  config: {
    webhookSecret: "",
  },
}));

vi.mock("../src/services/pr.service.js", () => ({
  prService: {
    createOrUpdatePR: vi.fn(),
    logEvent: vi.fn(),
    getPRByBitbucketId: vi.fn(),
    updateReviewerStatus: vi.fn(),
    updatePRState: vi.fn(),
    getPRWithReviewers: vi.fn(),
  },
}));

vi.mock("../src/services/user.service.js", () => ({
  userService: {
    findOrCreateUser: vi.fn(),
  },
}));

vi.mock("../src/services/notification.service.js", () => ({
  notificationService: {
    notifyReviewersOnPRCreated: vi.fn(),
    notifyReviewersOnPRUpdated: vi.fn(),
    notifyAuthorOnChangesRequested: vi.fn(),
    notifyAuthorOnAllApproved: vi.fn(),
    notifyAuthorOnComment: vi.fn(),
  },
}));

import { prService } from "../src/services/pr.service.js";
import { userService } from "../src/services/user.service.js";
import { notificationService } from "../src/services/notification.service.js";

describe("Bitbucket Webhook Handler", () => {
  let router: ReturnType<typeof createBitbucketWebhookRouter>;

  const mockPayload = {
    actor: {
      display_name: "Test Actor",
      uuid: "actor-uuid",
      nickname: "testactor",
      type: "user",
      account_id: "account-1",
    },
    repository: {
      name: "test-repo",
      full_name: "workspace/test-repo",
      uuid: "repo-uuid",
      workspace: {
        slug: "workspace",
        name: "Workspace",
        uuid: "ws-uuid",
      },
    },
    pullrequest: {
      id: 123,
      title: "Test PR",
      description: "Test description",
      state: "OPEN",
      source: {
        branch: { name: "feature" },
        repository: {
          name: "test-repo",
          full_name: "workspace/test-repo",
          uuid: "repo-uuid",
          workspace: { slug: "workspace", name: "Workspace", uuid: "ws-uuid" },
        },
      },
      destination: {
        branch: { name: "main" },
        repository: {
          name: "test-repo",
          full_name: "workspace/test-repo",
          uuid: "repo-uuid",
          workspace: { slug: "workspace", name: "Workspace", uuid: "ws-uuid" },
        },
      },
      author: {
        display_name: "Author",
        uuid: "author-uuid",
        nickname: "author",
        type: "user",
        account_id: "account-2",
      },
      reviewers: [],
      links: { html: { href: "https://example.com/pr/123" } },
      created_on: "2024-01-01T00:00:00Z",
      updated_on: "2024-01-01T00:00:00Z",
    },
  };

  const mockPR = {
    id: "pr-1",
    bitbucketId: 123,
    repositorySlug: "test-repo",
    workspaceSlug: "workspace",
    title: "Test PR",
    sourceBranch: "feature",
    destBranch: "main",
    state: "OPEN",
    url: "https://example.com/pr/123",
    authorId: "author-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewers: [],
    author: { displayName: "Author", slackUserId: "slack-author" },
  };

  beforeEach(() => {
    router = createBitbucketWebhookRouter();
    vi.clearAllMocks();

    vi.mocked(prService.createOrUpdatePR).mockResolvedValue(mockPR as never);
    vi.mocked(prService.getPRByBitbucketId).mockResolvedValue(mockPR as never);
    vi.mocked(prService.getPRWithReviewers).mockResolvedValue(mockPR as never);
    vi.mocked(userService.findOrCreateUser).mockResolvedValue({
      id: "user-1",
      bitbucketUuid: "actor-uuid",
      bitbucketEmail: null,
      slackUserId: null,
      displayName: "Test Actor",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  async function simulateWebhook(eventType: string, payload: object) {
    const req = {
      headers: {
        "x-event-key": eventType,
      },
      body: payload,
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    const handlers = (router as { stack: { route?: { path: string; stack: { handle: (req: Request, res: Response) => Promise<void> }[] } }[] }).stack;
    const postHandler = handlers.find((layer) => layer.route?.path === "/");

    if (postHandler?.route?.stack[0]) {
      await postHandler.route.stack[0].handle(req, res);
    }

    return res;
  }

  describe("pullrequest:created", () => {
    it("should create PR and notify reviewers", async () => {
      const res = await simulateWebhook("pullrequest:created", mockPayload);

      expect(userService.findOrCreateUser).toHaveBeenCalled();
      expect(prService.createOrUpdatePR).toHaveBeenCalled();
      expect(prService.logEvent).toHaveBeenCalledWith(
        "pr-1",
        "PR_CREATED",
        "actor-uuid",
        expect.any(Object)
      );
      expect(notificationService.notifyReviewersOnPRCreated).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("pullrequest:updated", () => {
    it("should update PR and notify reviewers who requested changes", async () => {
      const res = await simulateWebhook("pullrequest:updated", mockPayload);

      expect(prService.createOrUpdatePR).toHaveBeenCalled();
      expect(prService.logEvent).toHaveBeenCalledWith(
        "pr-1",
        "PR_UPDATED",
        "actor-uuid"
      );
      expect(notificationService.notifyReviewersOnPRUpdated).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("pullrequest:approved", () => {
    it("should update reviewer status and check if all approved", async () => {
      const approvalPayload = {
        ...mockPayload,
        approval: {
          date: "2024-01-01T00:00:00Z",
          user: mockPayload.actor,
        },
      };

      const res = await simulateWebhook("pullrequest:approved", approvalPayload);

      expect(prService.updateReviewerStatus).toHaveBeenCalledWith(
        "pr-1",
        "actor-uuid",
        "APPROVED"
      );
      expect(prService.logEvent).toHaveBeenCalledWith(
        "pr-1",
        "PR_APPROVED",
        "actor-uuid",
        expect.any(Object)
      );
      expect(notificationService.notifyAuthorOnAllApproved).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("pullrequest:changes_request_created", () => {
    it("should update reviewer status and notify author", async () => {
      const changesPayload = {
        ...mockPayload,
        changes_request: {
          date: "2024-01-01T00:00:00Z",
          user: mockPayload.actor,
        },
      };

      const res = await simulateWebhook(
        "pullrequest:changes_request_created",
        changesPayload
      );

      expect(prService.updateReviewerStatus).toHaveBeenCalledWith(
        "pr-1",
        "actor-uuid",
        "CHANGES_REQUESTED"
      );
      expect(notificationService.notifyAuthorOnChangesRequested).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("pullrequest:fulfilled", () => {
    it("should update PR state to merged", async () => {
      const res = await simulateWebhook("pullrequest:fulfilled", mockPayload);

      expect(prService.updatePRState).toHaveBeenCalledWith("pr-1", "MERGED");
      expect(prService.logEvent).toHaveBeenCalledWith(
        "pr-1",
        "PR_MERGED",
        "actor-uuid"
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
