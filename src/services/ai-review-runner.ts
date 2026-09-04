import { spawn, type ChildProcess } from "node:child_process";
import { config } from "../config/env.js";

export const AI_REVIEW_MODEL = "sonnet";
export const AI_REVIEW_EFFORT = "medium";

const ALLOWED_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "LS",
  "Agent",
  "Task",
  "Skill",
  "TodoWrite",
  "mcp__bitbucketMcp__bb_get",
  "mcp__bitbucketMcp__bb_post",
];

const DISALLOWED_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
];

const SUMMARY_MAX_CHARS = 20_000;
const STDERR_TAIL_CHARS = 2_000;
const SIGKILL_GRACE_MS = 10_000;

export interface ReviewTarget {
  workspaceSlug: string;
  repositorySlug: string;
  bitbucketId: number;
}

export type ReviewRunResult =
  | { ok: true; summary: string; costUsd: number | null; turns: number | null; sessionId: string | null }
  | { ok: false; error: string; summary: string | null };

export interface ReviewRunner {
  run(target: ReviewTarget): Promise<ReviewRunResult>;
}

interface ClaudePrintResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  session_id?: string;
}

export class ClaudeReviewRunner implements ReviewRunner {
  run(target: ReviewTarget): Promise<ReviewRunResult> {
    const bin = config.aiReview.claudeBin;
    const timeoutMs = config.aiReview.timeoutMinutes * 60_000;

    return new Promise((resolve) => {
      const child = spawn(bin, this.buildArgs(target), {
        cwd: config.aiReview.repoPath,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killProcessGroup(child, "SIGTERM");
        setTimeout(() => killProcessGroup(child, "SIGKILL"), SIGKILL_GRACE_MS).unref();
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error: `Could not start ${bin}: ${error.message}`, summary: null });
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve(this.interpret({ code, signal, stdout, stderr, timedOut }));
      });
    });
  }

  buildArgs(target: ReviewTarget): string[] {
    return [
      "--print",
      "--model",
      AI_REVIEW_MODEL,
      "--effort",
      AI_REVIEW_EFFORT,
      "--plugin-dir",
      config.aiReview.pluginPath,
      "--mcp-config",
      this.mcpConfigJson(),
      "--strict-mcp-config",
      "--output-format",
      "json",
      "--allowedTools",
      ALLOWED_TOOLS.join(","),
      "--disallowedTools",
      DISALLOWED_TOOLS.join(","),
      "--",
      this.prompt(target),
    ];
  }

  prompt(target: ReviewTarget): string {
    return `${config.aiReview.command} ${target.workspaceSlug}/${target.repositorySlug}/${target.bitbucketId}`;
  }

  mcpConfigJson(): string {
    const [command, ...args] = config.aiReview.bitbucketMcpCommand.trim().split(/\s+/);

    return JSON.stringify({
      mcpServers: {
        bitbucketMcp: {
          type: "stdio",
          command,
          args,
          env: {
            ATLASSIAN_USER_EMAIL: config.aiReview.bitbucketEmail,
            ATLASSIAN_API_TOKEN: config.aiReview.bitbucketApiToken,
            BITBUCKET_DEFAULT_WORKSPACE: config.bitbucket.workspace,
          },
        },
      },
    });
  }

  private interpret(run: {
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }): ReviewRunResult {
    const parsed = parsePrintResult(run.stdout);
    const summary = parsed?.result ? parsed.result.slice(0, SUMMARY_MAX_CHARS) : null;

    if (run.timedOut) {
      return {
        ok: false,
        error: `Timed out after ${config.aiReview.timeoutMinutes} minutes`,
        summary,
      };
    }

    if (run.code !== 0) {
      const detail = run.stderr.trim() || summary || `exit code ${run.code ?? run.signal}`;
      return { ok: false, error: detail.slice(-STDERR_TAIL_CHARS), summary };
    }

    if (parsed === null) {
      return { ok: false, error: "Claude produced no parsable result", summary: null };
    }

    if (parsed.is_error || (parsed.subtype !== undefined && parsed.subtype !== "success")) {
      return {
        ok: false,
        error: summary ?? parsed.subtype ?? "Claude reported an error",
        summary,
      };
    }

    return {
      ok: true,
      summary: summary ?? "",
      costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
      turns: typeof parsed.num_turns === "number" ? parsed.num_turns : null,
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : null,
    };
  }
}

function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;

  try {
    if (child.pid === undefined) throw new Error("no pid");
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function parsePrintResult(stdout: string): ClaudePrintResult | null {
  const trimmed = stdout.trim();
  if (trimmed === "") return null;

  try {
    return JSON.parse(trimmed) as ClaudePrintResult;
  } catch {
    const lastLine = trimmed.split("\n").reverse().find((line) => line.startsWith("{"));
    if (!lastLine) return null;
    try {
      return JSON.parse(lastLine) as ClaudePrintResult;
    } catch {
      return null;
    }
  }
}
