# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Development with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled app (production)
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Database
npm run db:generate  # Generate Prisma client after schema changes
npm run db:push      # Push schema changes (dev only, no migration)

# One-off backfill (existing open PRs predate commit-hash tracking)
npm run backfill:push-events -- --dry-run   # Preview
npm run backfill:push-events                # Store hashes + synthesize push events

# Docker
docker compose up -d    # Start PostgreSQL + app
docker compose logs app # View app logs

# Deployment (production runs in this directory)
./deploy.sh          # Rebuild, push schema, restart app
```

Run a single test file:
```bash
npx vitest run tests/user.service.test.ts
```

## Architecture

PR Tracker receives Bitbucket Cloud webhooks, logs events to PostgreSQL, sends Slack DM notifications, and serves a read-only web dashboard.

### Request Flow

```
Bitbucket Webhook → /webhooks/bitbucket → bitbucket.handler.ts
                                              ↓
                                         pr.service.ts → Database (Prisma)
                                              ↓
                                    notification.service.ts → slack.service.ts → Slack DMs

Slack Command → /slack/events → commands/*.command.ts → pr.service.ts → Response

Browser → /dashboard → dashboard.router.ts → dashboard.service.ts → Database (Prisma)
                                                   ↓
                                            dashboard.view.ts → server-rendered HTML
```

### Key Services

- **UserService** (`src/services/user.service.ts`): Maps Bitbucket users to Slack users. Auto-links by email matching, falls back to fuzzy name matching, or manual `/pr admin link` command.
- **PRService** (`src/services/pr.service.ts`): CRUD for pull requests and reviewers. Tracks reviewer status (PENDING/APPROVED/CHANGES_REQUESTED).
- **NotificationService** (`src/services/notification.service.ts`): Determines who to notify based on event type. Also notifies "watchers" (observers who receive all PR created/approved events).
- **SlackService** (`src/services/slack.service.ts`): Builds Block Kit messages and sends DMs.
- **DashboardService** (`src/services/dashboard.service.ts`): Builds the board of open PRs — per-reviewer states, per-PR headline state, "waiting on" lists, per-person review load, and staleness. Read-only; no writes.

### Dashboard

Server-rendered HTML at `/dashboard` (`/` redirects there). No client-side framework, no JS bundle — `dashboard.view.ts` returns an HTML string with inlined CSS from `dashboard.styles.ts`.

- `src/dashboard/dashboard.router.ts` - Single `GET /` route. `?person=<userId>` renders a per-person board (to review / authored / already reviewed); missing user → 404.
- `src/dashboard/dashboard.view.ts` - Renders board, person board, and error pages.
- `src/dashboard/dashboard.styles.ts` - The stylesheet, exported as `DASHBOARD_STYLES`.
- `src/utils/review-state.ts` - Shared state vocabulary and derivation, plus display helpers (`formatAge`, `initials`).

**State vocabulary** (`review-state.ts`): reviewer states are `AWAITING_FIRST_REVIEW`, `AWAITING_RE_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`.

`deriveReviewerState` derives a reviewer's state from our own `PREvent` log, not from the Bitbucket status. This is deliberate: Bitbucket Cloud never clears `changes_requested` when new commits land, so trusting its status would pin a reviewer to a verdict they gave against code the author has since replaced.

Two rules, and the asymmetry between them is intentional:

- **`CHANGES_REQUESTED` is stale once the author pushes** → `AWAITING_RE_REVIEW`. The reviewer asked for changes, the changes arrived, the ball is back in their court.
- **`APPROVED` is terminal.** A push never revokes it. Someone who approved has signed off and stopped caring; dragging them back would flood the board with re-reviews every time a branch is rebased. Note that a rebase changes commit hashes without changing content, so a hash-based rule would otherwise invalidate approvals for no reason.

The stored `PRReviewer.status` is only a fallback for reviewers with no logged verdict (PRs imported before the tracker ran), plus the `PENDING` case, which means the reviewer actively withdrew their verdict in Bitbucket and does count as a re-review.

PR headline state (`derivePRState`) is the worst reviewer state, in priority order `BLOCKED` > `AWAITING_RE_REVIEW` > `AWAITING_FIRST_REVIEW` > `READY_TO_MERGE`, or `NO_REVIEWERS` when there are none. That order also drives board sorting, with older PRs first within a state.

Staleness is measured from when the PR's headline state actually began, not from the last activity by anyone on the PR — a reviewer who hasn't reviewed yet has been waiting since the PR was opened even if someone else approved since, and a `BLOCKED` PR has been waiting on the author since the oldest outstanding `CHANGES_REQUESTED` verdict, not since a later approval from a different reviewer. `deriveReviewerStateSince` (`review-state.ts`) derives each reviewer's own wait-start the same way `deriveReviewerState` derives their state (PR creation for a first review, the push or manual re-review request that invalidated a verdict for a re-review, the verdict itself for changes requested); `DashboardService.stateSince` then takes the earliest such timestamp among the reviewers driving the headline state. Thresholded by `DASHBOARD_STALE_DAYS` (default 3); `READY_TO_MERGE` PRs are never marked stale.

### Dashboard Sign-In

"Sign in with Slack" (OpenID Connect) confirms which developer is looking at the board, so future action buttons can be authorized. Auth is optional: with `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SESSION_SECRET` unset the button disappears and the board stays anonymous.

- `src/auth/auth.router.ts` - `GET /auth/slack` (redirect to Slack), `GET /auth/slack/callback` (code exchange), `POST /auth/logout`, `GET /auth/me`.
- `src/auth/slack-oidc.ts` - authorize URL, `openid.connect.token` exchange, `id_token` claim checks (issuer, audience, expiry, nonce).
- `src/auth/session.ts` - signed session cookie, OAuth state cookie, `attachViewer` middleware, `requireViewer` guard for authenticated endpoints.
- `src/auth/signed-token.ts` - HMAC-SHA256 signing shared by the session and OAuth state.

The session is a signed (not encrypted) cookie holding `userId`, `slackUserId` and expiry — no server-side session store. The `id_token` signature is not verified because it arrives over TLS from a direct server-to-server code exchange. CSRF on the callback is covered by a one-shot `nonce` held in both the state token and its own cookie; `SameSite=Lax` covers the action endpoints.

A Slack account maps to a `User` by `slackUserId`, falling back to a case-insensitive `bitbucketEmail` match on a user that has no Slack link yet. No match means signed in but unlinked: the board says so and `requireViewer` returns 403.

### AI Code Review

"Request AI review" appears on a signed-in author's own open PRs (person board → "Your pull requests"), but only for PRs in the one repo the feature is scoped to (`AI_REVIEW_REPOSITORY_SLUG`) — PRs from any other tracked repo (e.g. `shiplink-backend`) never show the button, since the checkout mounted into the container is a single repo's working tree. It runs the Claude Code review plugin kept in `ai-review/code-review-bitbucket` (baked into the image) headless from the reviewed repo's checkout, and the command itself posts each finding as an inline Bitbucket comment on the line it concerns (a single general comment only when nothing is found). Each PR gets exactly one review: a `COMPLETED` review can never be re-run, only a `FAILED` one can be retried. The review reads code only — the headless run has no Bash/Edit/Write tools, so it cannot run tests, linters or builds.

- `src/services/ai-review.service.ts` - `request()` (author-only, one-per-PR guard via the unique `AiReview.pullRequestId`, repo-scoped via `isEnabledFor(repositorySlug)`), an in-process sequential queue, `recoverInterrupted()` at startup (rows left `QUEUED`/`RUNNING` by a restart become `FAILED`).
- `src/services/ai-review-runner.ts` - Spawns `claude --print --model sonnet --effort medium --plugin-dir ai-review/code-review-bitbucket ... "/code-review-bitbucket:code-review <workspace>/<repo>/<id>"` with `cwd` = the repo checkout, parses the JSON result. The model is always Sonnet at medium effort; both are passed as CLI flags so the mounted `~/.claude/settings.json` (`effortLevel`, model) cannot override them. The Bitbucket MCP server (`bitbucketMcp`, so the command's `mcp__bitbucketMcp__bb_get`/`bb_post` tool names resolve) is passed inline via `--mcp-config` using `AI_REVIEW_BITBUCKET_EMAIL`/`AI_REVIEW_BITBUCKET_API_TOKEN` (fallback `BITBUCKET_EMAIL`/`BITBUCKET_API_TOKEN`; the token must have `write:pullrequest` to post the comment).
- `POST /dashboard/pr/:prId/request-ai-review` (`requireViewer`) → 202, or 403 not author / 409 already reviewed or running / 503 not configured (includes PRs outside `AI_REVIEW_REPOSITORY_SLUG`).
- `AiReview` model: status `QUEUED` → `RUNNING` → `COMPLETED` | `FAILED`, plus `summary` (Claude's final message), `error`, `costUsd`. Events `PR_AI_REVIEW_REQUESTED` / `PR_AI_REVIEW_COMPLETED` / `PR_AI_REVIEW_FAILED` feed the activity rail; the author gets a Slack DM when the review finishes.
- Config: `AI_REVIEW_REPO_PATH` enables the feature (checkout of the reviewed repo, gitignored under `repos/`; the review runs from it to load its skills/CLAUDE.md files). `AI_REVIEW_REPOSITORY_SLUG` is the single `PullRequest.repositorySlug` the feature applies to, matched case-insensitively (Bitbucket webhooks send the repo's display name, e.g. `Shiplink`, not its lowercase URL slug) — a mismatch behaves exactly like the feature being unconfigured (button hidden, `request()` returns `NOT_CONFIGURED`). The plugin does not need to exist inside that checkout. Optional `AI_REVIEW_PLUGIN_PATH`, `AI_REVIEW_COMMAND`, `AI_REVIEW_CLAUDE_BIN`, `AI_REVIEW_BITBUCKET_MCP_COMMAND`, `AI_REVIEW_BITBUCKET_EMAIL`, `AI_REVIEW_BITBUCKET_API_TOKEN`, `AI_REVIEW_TIMEOUT_MINUTES` (default 30).
- Docker: the image installs the Claude Code CLI and the Bitbucket MCP server, runs as the host uid (`APP_UID`/`APP_GID`) and mounts `~/.claude` (OAuth credentials, settings, project memory) at `/home/app/.claude` with `CLAUDE_CONFIG_DIR` pointing there; the repo checkout is mounted at the same absolute path as on the host so Claude's per-project memory matches.

### Hurry Up

A signed-in developer can hurry whoever a PR is waiting on, once the PR has sat in its current headline state for at least `DASHBOARD_HURRY_AFTER_HOURS` (default 24):

- `BLOCKED` (changes requested, no push since) → "Hurry up" pings the **author** (`PR_HURRIED`).
- `AWAITING_FIRST_REVIEW` / `AWAITING_RE_REVIEW` → "Hurry reviewers" pings only the reviewers who still owe a review (`PR_REVIEWERS_HURRIED`), typically used by the author.

`BoardPullRequest.hurry.target` / `targetIds` say who would be pinged; the button shows for every signed-in viewer who is not one of the targets. It opens a full-screen mash game: Space/Enter (or tapping the circle) grows it, it shrinks when you stop, and it only reaches the border at a sustained ~7 presses/second within 15 seconds. Winning posts the hurry; losing sends nothing.

- `src/dashboard/hurry-game.ts` - The game (`HURRY_GAME_SCRIPT`, inlined only for signed-in linked viewers) and the styles for the button, badge and growing cards (`HURRY_GAME_STYLES`). The tuning constants at the top of the script set the difficulty.
- `src/services/hurry.service.ts` - `hurry()` checks the PR via `DashboardService.getPullRequest` (open, hurryable, you are not a target, not cooling down) and logs the event matching the target. There is no separate model; hurries live in the event log.
- `POST /dashboard/pr/:prId/hurry` (`requireViewer`) → `{ ok, count }` and a Slack DM to each target (`NotificationService.notifyOnHurry`, mute respected), or 403 you are a target / 404 / 409 not hurryable / 429 cooling down (`DASHBOARD_HURRY_COOLDOWN_MINUTES`, default 60, per person per PR).
- `BoardPullRequest.hurry.count` counts both hurry events since the PR's current headline state began. The card grows with that count (capped at 6 levels) and shrinks back as soon as the state changes (author pushes, a reviewer responds so the PR moves on). The game itself runs client-side, so the server cannot tell whether someone actually mashed; it only enforces eligibility and the cooldown.

### Webhook Events Handled

`pullrequest:created`, `pullrequest:updated`, `pullrequest:approved`, `pullrequest:changes_request_created`, `pullrequest:comment_created`, `pullrequest:fulfilled`, `pullrequest:rejected`

### Slack Commands

All commands use `/pr` prefix: `status <ws/repo/id>`, `my-reviews`, `my-prs`, `nudge <ws/repo/id>`, `mute`, `unmute`, `watch`, `unwatch`, `help`, `admin` (requires `SLACK_ADMIN_USER_ID`)

### Database Models

- **User**: Links bitbucketUuid ↔ slackUserId. Has `isWatcher` flag for observers (management) who receive all PR notifications.
- **PullRequest**: Unique by (bitbucketId, repositorySlug, workspaceSlug). `sourceCommitHash` holds the branch head last seen; comparing it against an incoming payload is how a real push is told apart from a title/description edit.
- **PRReviewer**: Junction table with review status
- **PREvent**: Audit log of all PR events. `PR_COMMITS_PUSHED` is ours, not Bitbucket's — emitted only when `sourceCommitHash` actually changes, and it is what invalidates stale reviewer verdicts. `PR_HURRIED` / `PR_REVIEWERS_HURRIED` are also ours (dashboard "Hurry up").
- **AiReview**: At most one per PullRequest (unique `pullRequestId`); who requested it, status, Claude's final message and cost.

### Testing

Tests mock Prisma client via `tests/setup.ts`. Services are tested in isolation with mocked dependencies.

**Test structure:**
- `tests/*.test.ts` - Unit tests for individual services
- `tests/functional/*.test.ts` - End-to-end workflow tests
- `tests/fixtures/bitbucket-payloads.ts` - Realistic Bitbucket webhook payloads with test users/repos

**Vitest note:** `vi.mock()` calls are hoisted to top of file. Variables referenced in mock factories must be defined inside the factory function, not outside.

## Code Style

- Never add comments - code should be self-explanatory with clear, understandable variable and function names
