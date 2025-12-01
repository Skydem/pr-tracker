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
npm run db:migrate   # Create and apply migrations
npm run db:push      # Push schema changes (dev only, no migration)

# Docker
docker-compose up -d # Start PostgreSQL + app
```

Run a single test file:
```bash
npx vitest run tests/user.service.test.ts
```

## Architecture

PR Tracker receives Bitbucket Cloud webhooks, logs events to PostgreSQL, and sends Slack DM notifications.

### Request Flow

```
Bitbucket Webhook � /webhooks/bitbucket � bitbucket.handler.ts
                                              �
                                         pr.service.ts � Database (Prisma)
                                              �
                                    notification.service.ts � slack.service.ts � Slack DMs

Slack Command � /slack/events � commands/*.command.ts � pr.service.ts � Response
```

### Key Services

- **UserService** (`src/services/user.service.ts`): Maps Bitbucket users to Slack users. Auto-links by email matching, falls back to fuzzy name matching, or manual `/pr admin link` command.
- **PRService** (`src/services/pr.service.ts`): CRUD for pull requests and reviewers. Tracks reviewer status (PENDING/APPROVED/CHANGES_REQUESTED).
- **NotificationService** (`src/services/notification.service.ts`): Determines who to notify based on event type and sends via SlackService.
- **SlackService** (`src/services/slack.service.ts`): Builds Block Kit messages and sends DMs.

### Webhook Events Handled

`pullrequest:created`, `pullrequest:updated`, `pullrequest:approved`, `pullrequest:changes_request_created`, `pullrequest:comment_created`, `pullrequest:fulfilled`, `pullrequest:rejected`

### Slack Commands

All commands use `/pr` prefix: `status <ws/repo/id>`, `my-reviews`, `my-prs`, `nudge <ws/repo/id>`, `mute`, `unmute`, `help`, `admin` (requires `SLACK_ADMIN_USER_ID`)

### Database Models

- **User**: Links bitbucketUuid � slackUserId
- **PullRequest**: Unique by (bitbucketId, repositorySlug, workspaceSlug)
- **PRReviewer**: Junction table with review status
- **PREvent**: Audit log of all PR events

### Testing

Tests mock Prisma client via `tests/setup.ts`. Services are tested in isolation with mocked dependencies.

**Test structure:**
- `tests/*.test.ts` - Unit tests for individual services
- `tests/functional/*.test.ts` - End-to-end workflow tests
- `tests/fixtures/bitbucket-payloads.ts` - Realistic Bitbucket webhook payloads with test users/repos

**Vitest note:** `vi.mock()` calls are hoisted to top of file. Variables referenced in mock factories must be defined inside the factory function, not outside.
- never add comments, code should be self explanatory with clear, understandable variable, function names