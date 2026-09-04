---
allowed-tools: mcp__bitbucketMcp__bb_get, mcp__bitbucketMcp__bb_post
description: Code review a pull request
argument-hint: [workspace/repo_slug/pr_id]
model: sonnet
disable-model-invocation: false
---

Provide a thorough, recall-biased code review for the given pull request. Make a todo list first.

## Repo skills & CLAUDE.md (shiplink)

Before reviewing, discover the CLAUDE.md files that govern the change: the root CLAUDE.md (if one exists) and any CLAUDE.md in a directory whose files the pull request modified. Then, from the paths the change touches, work out which repo skills are required and apply them:

- `src/**` → load `shiplink-symfony-skill` (Skill tool)
- `assets/**` → load `shiplink-vue2-skill` (Skill tool) and apply `reviewFrontCodeQuality`
- `packages/web-v3/**` → apply `reviewFrontV3CodeQuality`

A change can require more than one skill. For `reviewFrontCodeQuality` and `reviewFrontV3CodeQuality`, do NOT invoke the skill itself — it fans out its own two-agent architecture review (auditor + principles reviewer), which is out of scope here. Instead, Read the rulebook reference files directly and apply them as review criteria:

- `reviewFrontCodeQuality` → `.claude/skills/reviewFrontCodeQuality/references/ARCHITECTURE_REVIEW_RUBRIC.md` and `.claude/skills/reviewFrontCodeQuality/references/FRONTEND_CLEAN_CODE_RULES.md`
- `reviewFrontV3CodeQuality` → `.claude/skills/reviewFrontV3CodeQuality/references/V3_ARCHITECTURE_REVIEW_RUBRIC.md` and `.claude/skills/reviewFrontV3CodeQuality/references/V3_FRONTEND_CLEAN_CODE_RULES.md`

Also read the memories that go with these docs: any files a CLAUDE.md imports with an `@path` reference, and the session's memory files (`#` memory notes / auto-memory) — treat their rules as review criteria too. Note that CLAUDE.md is guidance for Claude as it writes code, so not all of its instructions apply during review.

## Target

`$ARGUMENTS` names the pull request to review as `{workspace}/{repo_slug}/{id}` (for example `shiplink/shiplink/2050`). When it is given, review exactly that pull request and post the comment there — do not look for a PR from the current branch. When it is empty, fall back to the PR of the current branch, or to the local diff as described in Phase 0.

## Phase 0 — Gather the diff

Read the pull request with `mcp__bitbucketMcp__bb_get`: its metadata (workspace, repo slug, PR id), the diff, and the list of changed file paths. If a PR number, branch name, or file path was passed as an argument, review that target instead. Treat the diff as the review scope. If you are instead working from a local checkout with no PR, run `git diff @{upstream}...HEAD` (or `git diff main...HEAD` / `git diff HEAD~1` if there's no upstream), and also `git diff HEAD` to include working-tree changes.

## Finder budget

Count the diff's added + removed lines (from the `bb_get` diff, or `git diff --numstat` locally). Spawn about `ceil(lines / 150)` finder subagents, clamped to **min 2, max 8** — scale your investigation depth to the diff size rather than using a fixed large fleet.

## Phase 1 — Find candidates (3 correctness angles + 3 cleanup angles + 1 altitude angle + 1 conventions angle, up to 6 each)

Run **8 independent finder angles** via the Agent/Task tool (`subagent_type: "general-purpose"`, `model: "sonnet"` — every subagent in this review runs on Sonnet). Each surfaces **up to 6 candidate findings** with `file`, `line`, a one-line `summary`, and a concrete `failure_scenario`. If the Agent tool is not available in your current tool set, do not error — perform each angle yourself, sequentially, in this context.

### Angle A — line-by-line diff scan
Read every hunk in the diff, line by line. Then Read the enclosing function for each hunk — bugs in unchanged lines of a touched function are in scope (the PR re-exposes or fails to fix them). For every line ask: what input, state, timing, or platform makes this line wrong? Look for inverted/wrong conditions, off-by-one, null/undefined deref, missing `await`, falsy-zero checks, wrong-variable copy-paste, error swallowed in catch, unescaped regex metachars.

### Angle B — removed-behavior auditor
For every line the diff DELETES or replaces, name the invariant or behavior it enforced, then search the new code for where that invariant is re-established. If you can't find it, that's a candidate: a removed guard, a dropped error path, a narrowed validation, a deleted test that was covering a real case.

### Angle C — cross-file tracer
For each function the diff changes, find its callers (Grep for the symbol) and check whether the change breaks any call site: a new precondition, a changed return shape, a new exception, a timing/ordering dependency. Also check callees: does a parallel change in the same PR make a call unsafe?

### Reuse
The angles above hunt for bugs; this one and the next two hunt for cleanup in the changed code. Flag new code that re-implements something the codebase already has — Grep shared/utility modules and files adjacent to the change, and name the existing helper to call instead.

### Simplification
Flag unnecessary complexity the diff adds: redundant or derivable state, copy-paste with slight variation, deep nesting, dead code left behind. Name the simpler form that does the same job.

### Efficiency
Flag wasted work the diff introduces: redundant computation or repeated I/O, independent operations run sequentially, blocking work added to startup or hot paths. Also flag long-lived objects built from closures or captured environments — they keep the entire enclosing scope alive for the object's lifetime (a memory leak when that scope holds large values); prefer a class/struct that copies only the fields it needs. Name the cheaper alternative.

### Altitude
Check that each change is implemented at the right depth, not as a fragile bandaid. Special cases layered on shared infrastructure are a sign the fix isn't deep enough — prefer generalizing the underlying mechanism over adding special cases.

### Conventions (CLAUDE.md + memories)
Find the CLAUDE.md files that govern the changed code: the user-level `~/.claude/CLAUDE.md`, the repo-root CLAUDE.md, plus any CLAUDE.md or CLAUDE.local.md in a directory that is an ancestor of a changed file (a directory's CLAUDE.md only applies to files at or below it). Also read the memories that go with them: any files a CLAUDE.md imports with an `@path` reference, and the session's memory files (`#` memory notes / auto-memory). Read each one that exists, then check the diff for clear violations of the rules they state. Only flag a violation when you can quote the exact rule and the exact line that breaks it — no style preferences, no vague "spirit of the doc" inferences. In the finding, name the CLAUDE.md / memory path and quote the rule so the report can cite it. If no CLAUDE.md or memory applies, return nothing for this angle.

Cleanup, altitude, and conventions candidates use the same `file`/`line`/`summary` shape; in `failure_scenario`, state the concrete cost (what is duplicated, wasted, harder to maintain, or which CLAUDE.md rule is broken) instead of a crash. Correctness bugs always outrank cleanup, altitude, and conventions findings when the output cap forces a cut.

Pass every candidate with a nameable failure scenario through — finders that silently drop half-believed candidates bypass the verify step and are the dominant cause of misses.

## Phase 2 — Verify (1-vote, recall-biased)

Dedup near-duplicates (same defect, same location, same reason → keep one). For each remaining candidate, run **one verifier** via the Agent tool (`model: "sonnet"`): give it the diff, the relevant file(s), and the candidate; it returns exactly one of **CONFIRMED / PLAUSIBLE / REFUTED**.

**PLAUSIBLE by default** — do not refute a candidate for being "speculative" or "depends on runtime state" when the state is realistic: concurrency races, nil/undefined on a rare-but-reachable path (error handler, cold cache, missing optional field), falsy-zero treated as missing, off-by-one on a boundary the code does not exclude, retry storms / partial failures, regex/allowlist that lost an anchor. These are PLAUSIBLE.
**REFUTED** only when constructible from the code: factually wrong (quote the actual line); provably impossible (type/constant/invariant — show it); already handled in this diff (cite the guard); or pure style with no observable effect.

Keep **CONFIRMED and PLAUSIBLE**. Drop REFUTED.

## Output — post inline comments to Bitbucket

Keep at most **10 findings**, ranked most-severe first. Post **each finding as its own inline comment**, anchored to the file and line it is about, with `mcp__bitbucketMcp__bb_post`:

```
path: /repositories/{workspace}/{repo_slug}/pullrequests/{id}/comments
body: {
  "content": { "raw": "<the finding>" },
  "inline": { "path": "<filepath as it appears in the diff>", "to": <new-side line number> }
}
```

Anchor rules (Bitbucket rejects or misplaces the comment otherwise):
- `inline.path` is the full path within the repo exactly as it appears in the diff header (no leading `a/` or `b/`)
- A line added by the PR, or an unchanged context line: use `"to": <line number in the new file>`
- A line deleted by the PR: use `"from": <line number in the old file>` instead of `to`
- One line only — pick the single line most relevant to the issue, never a range
- The line must be part of a hunk in the PR diff (added, deleted, or context). If the best line is not in the diff, anchor to the nearest line in the same file that is
- Post the comments one at a time, most-severe first. Do not post a general (non-inline) summary comment when there are findings — the inline comments are the review

Each inline comment must be brief, avoid emojis, and state the bug plus the concrete failure scenario. Cite the rule when the finding is a convention violation:

---

**<one-line title of the bug>**

<two to four sentences: what is wrong, and the concrete input/state that makes it fail. If a CLAUDE.md or memory rule is broken, quote it: CLAUDE.md says "<...>". If it depends on another file, name the file and the code>

---

Only when **no findings** survive verification, post a single general (non-inline) comment:

---

### Code review

No issues found. Checked for bugs and CLAUDE.md compliance.

---

Do not append any footer, signature, or reaction request to any comment.

## False positives to skip

- Pre-existing issues
- Something that looks like a bug but is not actually a bug
- Pedantic nitpicks that a senior engineer wouldn't call out
- Issues that a linter, typechecker, or compiler would catch (e.g. missing or incorrect imports, type errors, broken tests, formatting issues, pedantic style issues like newlines). No need to run these build steps yourself — it is safe to assume they run separately in CI
- General code quality issues (e.g. lack of test coverage, general security issues, poor documentation), unless explicitly required in CLAUDE.md
- Issues that are called out in CLAUDE.md, but explicitly silenced in the code (e.g. a lint ignore comment)
- Changes in functionality that are likely intentional or are directly related to the broader change
- Real issues, but on lines the user did not modify in the pull request

## Notes

- This is a code-reading review only. Do not run tests, linters, type checkers, builds, or any other commands — read the diff and the surrounding code, and reason about it. Build signal and test results are produced separately and are not relevant to this review
- Use the Bitbucket MCP tools (`mcp__bitbucketMcp__bb_get` to read PRs, diffs, comments, and history; `mcp__bitbucketMcp__bb_post` to create comments) to interact with Bitbucket, rather than WebFetch
- Each finding is anchored inline to its line, so no diff links are needed inside the comment. When a finding rests on another file or on a CLAUDE.md rule, name the file path (and quote the rule) so a reader can find it
