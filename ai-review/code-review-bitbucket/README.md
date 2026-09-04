# Code Review Plugin

Automated code review for Bitbucket pull requests using a high-effort, recall-biased multi-agent workflow that loads the repo's shiplink skills.

## Overview

The Code Review Plugin reviews a pull request by fanning out eight independent finder angles (three correctness, three cleanup, one altitude, one conventions), verifying each candidate with a one-vote recall-biased pass, and posting at most ten high-confidence findings back to the pull request as inline comments, one per finding. It discovers the CLAUDE.md files and shiplink skills that govern the change, and treats their rules (plus session memories) as review criteria.

## Commands

### `/code-review-bitbucket:code-review [workspace/repo_slug/pr_id]`

Performs an automated code review on a pull request at high effort (recall-biased), always on Sonnet. Pass the target as `workspace/repo_slug/pr_id` (this is how PR Tracker invokes it); without an argument it reviews the current branch's PR.

**What it does:**
1. Discovers the CLAUDE.md files and shiplink skills that govern the change, and loads them as review criteria (see [Skills routing](#skills-routing))
2. Gathers the pull request diff (via `bb_get`)
3. Sizes the diff and derives a finder budget (~`ceil(lines / 150)`, clamped 2–8)
4. Runs 8 independent finder angles (Sonnet, general-purpose agents), up to 6 candidates each
5. Verifies each candidate with a one-vote, recall-biased pass (CONFIRMED / PLAUSIBLE / REFUTED)
6. Posts the surviving findings (at most 10, most-severe first) as inline Bitbucket PR comments, one per finding, anchored to the file and line

**Usage:**
```bash
/code-review-bitbucket:code-review shiplink/Shiplink/2043
# or, on a PR branch:
/code-review-bitbucket:code-review
```

**Example workflow:**
```bash
/code-review-bitbucket:code-review shiplink/Shiplink/2043

# Claude will:
# - Load the shiplink skills + CLAUDE.md rules for the touched paths
# - Fan out 8 finder angles and verify their candidates
# - Post up to 10 inline findings, most-severe first
```

## Skills routing

The review loads repo skills based on the paths the pull request touches. A PR can require more than one skill.

| Path | Skills |
|------|--------|
| `src/**` | `shiplink-symfony-skill` |
| `assets/**` | `shiplink-vue2-skill`, `reviewFrontCodeQuality` |
| `packages/web-v3/**` | `reviewFrontV3CodeQuality` |

- `shiplink-symfony-skill` and `shiplink-vue2-skill` are loaded with the Skill tool, the same way you would before writing code in that layer.
- `reviewFrontCodeQuality` and `reviewFrontV3CodeQuality` are **not** invoked (that would fan out their own two-agent review). Their rulebook reference files are read directly and applied as criteria:
  - `reviewFrontCodeQuality` → `.claude/skills/reviewFrontCodeQuality/references/ARCHITECTURE_REVIEW_RUBRIC.md` and `FRONTEND_CLEAN_CODE_RULES.md`
  - `reviewFrontV3CodeQuality` → `.claude/skills/reviewFrontV3CodeQuality/references/V3_ARCHITECTURE_REVIEW_RUBRIC.md` and `V3_FRONTEND_CLEAN_CODE_RULES.md`

The review also reads memories: `@path` imports referenced from a CLAUDE.md, and the session's memory files (`#` memory notes / auto-memory).

## Review methodology

### Phase 0 — Gather the diff
The PR is read via `mcp__bitbucketMcp__bb_get` (metadata, diff, changed paths).

### Phase 1 — Find candidates
Eight finder angles, up to 6 candidates each, each with `file`, `line`, `summary`, and `failure_scenario`:

1. **Angle A** — line-by-line diff scan
2. **Angle B** — removed-behavior auditor
3. **Angle C** — cross-file tracer
4. **Reuse** — re-implemented existing helpers
5. **Simplification** — unnecessary complexity
6. **Efficiency** — wasted work / leaks
7. **Altitude** — right depth vs. fragile bandaid
8. **Conventions** — CLAUDE.md + memory violations (must quote the exact rule)

### Phase 2 — Verify
One verifier per candidate, recall-biased. `PLAUSIBLE by default` — candidates are only dropped as `REFUTED` when constructible from the code. `CONFIRMED` and `PLAUSIBLE` survive.

### Output
At most 10 findings, most-severe first, each posted as an inline comment via `bb_post`.

## Review comment format

Each finding is one inline comment on the line it concerns (`inline.path` + `to` for new-side lines, `from` for deleted lines):

```markdown
**Missing error handling for OAuth callback**

The callback swallows the exception from `exchangeCode()`, so a revoked grant leaves the user on a blank page. CLAUDE.md says "Always handle OAuth errors".

_Created with Claude Code_
```

Every comment ends with the `_Created with Claude Code_` attribution line and nothing else (no reaction request). Only when nothing survives verification does the review post a single general comment:

```markdown
### Code review

No issues found. Checked for bugs and CLAUDE.md compliance.

_Created with Claude Code_
```

## False positives skipped

- Pre-existing issues
- Something that looks like a bug but is not actually a bug
- Pedantic nitpicks that a senior engineer wouldn't call out
- Issues a linter, typechecker, or compiler would catch (imports, type errors, broken tests, formatting)
- General code quality issues (unless explicitly required in CLAUDE.md)
- Issues silenced in code (e.g. lint ignore comments)
- Intentional changes or changes directly related to the broader PR
- Real issues on lines the user did not modify

## Installation

This plugin is included in the repository under `.claude/plugins/code-review-bitbucket`. The command is automatically available when running Claude Code from this repo.

## Requirements

- Git repository hosted on Bitbucket
- Bitbucket MCP server (`bitbucketMcp`) connected and authenticated
- `mcp__bitbucketMcp__bb_get` and `mcp__bitbucketMcp__bb_post` available
- CLAUDE.md files (optional but recommended)

## Best Practices

- Maintain clear CLAUDE.md files — the conventions angle flags only violations it can quote
- Keep the touched-path → skill mapping in sync with the repo layout
- Run on all non-trivial pull requests
- Treat the findings as a starting point for human review

## Troubleshooting

### No review comment posted

Check if:
- No findings survived verification (CONFIRMED/PLAUSIBLE only)
- `bitbucketMcp` is disconnected or unauthenticated
- The PR is unreachable at `/repositories/{workspace}/{repo_slug}` via `bb_get`

### Inline comment rejected or on the wrong line

- `inline.path` must be the path exactly as it appears in the diff (no `a/` / `b/` prefix)
- `to` is the new-file line number (added or context lines); deleted lines use `from` with the old-file line number
- The line must belong to a hunk of the PR diff
- Single line only — no ranges

### Bitbucket MCP not working

- Verify the `bitbucketMcp` server is connected
- Verify its auth token is valid for the target workspace

## Technical details

- **8 finder angles** — 3 correctness + 3 cleanup + 1 altitude + 1 conventions
- **1-vote recall-biased verify** — PLAUSIBLE by default, REFUTED only when constructible from the code
- **Finder budget** — scales with diff size (~lines/150, clamped 2–8)
- **Skills-aware** — routes touched paths to the repo's shiplink skills
- **Output cap** — at most 10 inline findings, most-severe first

## Author

Tomasz Torbus (tomasz.torbus@shiplink.se)

## Version

1.0.0
