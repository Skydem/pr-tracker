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

Staleness is measured from the last PR event (falling back to `updatedAt`), thresholded by `DASHBOARD_STALE_DAYS` (default 3); `READY_TO_MERGE` PRs are never marked stale.

### Webhook Events Handled

`pullrequest:created`, `pullrequest:updated`, `pullrequest:approved`, `pullrequest:changes_request_created`, `pullrequest:comment_created`, `pullrequest:fulfilled`, `pullrequest:rejected`

### Slack Commands

All commands use `/pr` prefix: `status <ws/repo/id>`, `my-reviews`, `my-prs`, `nudge <ws/repo/id>`, `mute`, `unmute`, `watch`, `unwatch`, `help`, `admin` (requires `SLACK_ADMIN_USER_ID`)

### Database Models

- **User**: Links bitbucketUuid ↔ slackUserId. Has `isWatcher` flag for observers (management) who receive all PR notifications.
- **PullRequest**: Unique by (bitbucketId, repositorySlug, workspaceSlug). `sourceCommitHash` holds the branch head last seen; comparing it against an incoming payload is how a real push is told apart from a title/description edit.
- **PRReviewer**: Junction table with review status
- **PREvent**: Audit log of all PR events. `PR_COMMITS_PUSHED` is ours, not Bitbucket's — emitted only when `sourceCommitHash` actually changes, and it is what invalidates stale reviewer verdicts.

### Testing

Tests mock Prisma client via `tests/setup.ts`. Services are tested in isolation with mocked dependencies.

**Test structure:**
- `tests/*.test.ts` - Unit tests for individual services
- `tests/functional/*.test.ts` - End-to-end workflow tests
- `tests/fixtures/bitbucket-payloads.ts` - Realistic Bitbucket webhook payloads with test users/repos

**Vitest note:** `vi.mock()` calls are hoisted to top of file. Variables referenced in mock factories must be defined inside the factory function, not outside.

## Code Style

- Never add comments - code should be self-explanatory with clear, understandable variable and function names
