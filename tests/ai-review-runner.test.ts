import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/config/env.js", () => ({
  config: {
    aiReview: {
      repoPath: "/tmp",
      pluginPath: "/app/ai-review/code-review-bitbucket",
      command: "/code-review-bitbucket:code-review",
      claudeBin: "tests/fixtures/fake-claude.sh",
      bitbucketMcpCommand: "npx -y @aashari/mcp-server-atlassian-bitbucket",
      timeoutMinutes: 30,
      bitbucketEmail: "reviewer@acme.test",
      bitbucketApiToken: "review-token-456",
    },
    bitbucket: { workspace: "acme", email: "bot@acme.test", apiToken: "token-123", repos: [] },
  },
}));

import { config } from "../src/config/env.js";
import { ClaudeReviewRunner, AI_REVIEW_MODEL, AI_REVIEW_EFFORT } from "../src/services/ai-review-runner.js";

const target = { workspaceSlug: "acme", repositorySlug: "backend", bitbucketId: 482 };

describe("ClaudeReviewRunner.buildArgs", () => {
  it("runs the review command headless on Sonnet at medium effort with only read tools and the Bitbucket MCP", () => {
    const args = new ClaudeReviewRunner().buildArgs(target);

    expect(AI_REVIEW_MODEL).toBe("sonnet");
    expect(AI_REVIEW_EFFORT).toBe("medium");
    expect(args).toContain("--print");
    expect(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2)).toEqual(["--model", "sonnet"]);
    expect(args.slice(args.indexOf("--effort"), args.indexOf("--effort") + 2)).toEqual(["--effort", "medium"]);
    expect(args.slice(args.indexOf("--plugin-dir"), args.indexOf("--plugin-dir") + 2)).toEqual([
      "--plugin-dir",
      "/app/ai-review/code-review-bitbucket",
    ]);
    expect(args).toContain("--strict-mcp-config");
    expect(args.at(-1)).toBe("/code-review-bitbucket:code-review acme/backend/482");

    const allowed = args[args.indexOf("--allowedTools") + 1]!.split(",");
    expect(allowed).toContain("mcp__bitbucketMcp__bb_get");
    expect(allowed).toContain("mcp__bitbucketMcp__bb_post");
    expect(allowed).not.toContain("Bash");

    const disallowed = args[args.indexOf("--disallowedTools") + 1]!.split(",");
    expect(disallowed).toEqual(expect.arrayContaining(["Bash", "Edit", "Write"]));
  });

  it("builds the Bitbucket MCP server from the review's Bitbucket credentials", () => {
    const json = JSON.parse(new ClaudeReviewRunner().mcpConfigJson());

    expect(json.mcpServers.bitbucketMcp).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@aashari/mcp-server-atlassian-bitbucket"],
      env: {
        ATLASSIAN_USER_EMAIL: "reviewer@acme.test",
        ATLASSIAN_API_TOKEN: "review-token-456",
        BITBUCKET_DEFAULT_WORKSPACE: "acme",
      },
    });
  });

});

describe("ClaudeReviewRunner.run", () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "fake-claude-"));
    process.env.FAKE_CLAUDE_ARGS_FILE = join(scratch, "args.txt");
    config.aiReview.claudeBin = join(process.cwd(), "tests/fixtures/fake-claude.sh");
    config.aiReview.timeoutMinutes = 30;
  });

  afterEach(() => {
    delete process.env.FAKE_CLAUDE_MODE;
    delete process.env.FAKE_CLAUDE_ARGS_FILE;
    rmSync(scratch, { recursive: true, force: true });
  });

  it("returns the final message, cost and turns on success", async () => {
    process.env.FAKE_CLAUDE_MODE = "success";

    const result = await new ClaudeReviewRunner().run(target);

    expect(result).toEqual({
      ok: true,
      summary: "### Code review\n\nFound 1 issue.",
      costUsd: 1.25,
      turns: 42,
      sessionId: "sess-1",
    });
    const receivedArgs = readFileSync(process.env.FAKE_CLAUDE_ARGS_FILE!, "utf8").split("\n");
    expect(receivedArgs).toContain("/code-review-bitbucket:code-review acme/backend/482");
  });

  it("fails when Claude reports an error result", async () => {
    process.env.FAKE_CLAUDE_MODE = "error_result";

    const result = await new ClaudeReviewRunner().run(target);

    expect(result).toEqual({ ok: false, error: "Reached max turns", summary: "Reached max turns" });
  });

  it("fails with the stderr tail when the process exits non-zero", async () => {
    process.env.FAKE_CLAUDE_MODE = "crash";

    const result = await new ClaudeReviewRunner().run(target);

    expect(result).toEqual({ ok: false, error: "boom: something broke", summary: null });
  });

  it("fails when the binary cannot be started", async () => {
    config.aiReview.claudeBin = "/nonexistent/claude-bin";

    const result = await new ClaudeReviewRunner().run(target);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Could not start /nonexistent/claude-bin");
  });

  it("kills the process and fails after the timeout", async () => {
    process.env.FAKE_CLAUDE_MODE = "hang";
    config.aiReview.timeoutMinutes = 0.002;

    const result = await new ClaudeReviewRunner().run(target);

    expect(result).toEqual({ ok: false, error: "Timed out after 0.002 minutes", summary: null });
  });
});
