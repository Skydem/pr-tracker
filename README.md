# PR Tracker

Pull Request tracking application that monitors Bitbucket Cloud PRs and sends Slack notifications to keep your team informed about code reviews.

## Features

- Tracks PR events (created, updated, approved, changes requested, comments, merged, declined)
- Sends Slack DM notifications to relevant team members
- Slash commands to check PR status and pending reviews
- Automatic user linking via email matching between Bitbucket and Slack
- Mute/unmute notifications per user
- Admin commands for user management

## Tech Stack

- **Runtime**: Node.js 22+ with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Slack**: Bolt SDK with Socket Mode support
- **Testing**: Vitest

## Prerequisites

- Node.js 22+
- Docker and Docker Compose
- Bitbucket Cloud workspace with webhook access
- Slack workspace with permission to create apps

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd pr-tracker
npm install
```

### 2. Create Environment File

```bash
cp .env.example .env
```

### 3. Create Slack App

#### Option A: Using Manifest (Recommended)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From an app manifest**
3. Select your workspace
4. Paste the contents of `slack-manifest.yaml` from this repository
5. Review and click **Create**
6. Go to **Basic Information** → **App-Level Tokens** → **Generate Token** with `connections:write` scope
7. Copy the token (`xapp-...`) to your `.env` as `SLACK_APP_TOKEN`

To switch from Socket Mode to HTTP mode (for production):
1. Go to **Socket Mode** and disable it
2. Go to **Slash Commands** → edit `/pr` → set Request URL to `https://your-domain.com/slack/events`

#### Option B: Manual Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**, name it "PR Tracker", select your workspace

**Configure OAuth & Permissions:**

Navigate to **OAuth & Permissions** and add these Bot Token Scopes:
- `chat:write` - Send messages
- `commands` - Handle slash commands
- `users:read` - Look up users
- `users:read.email` - Match users by email

**Create Slash Command:**

Navigate to **Slash Commands** and create:
- Command: `/pr`
- Request URL: `https://your-domain.com/slack/events`
- Description: `PR Tracker commands`
- Usage Hint: `[status|my-reviews|my-prs|nudge|mute|unmute|help]`

#### Enable Socket Mode (Optional, for local development)

Navigate to **Socket Mode**, enable it, and generate an App Token with `connections:write` scope.

#### Install App

Navigate to **Install App** and click **Install to Workspace**.

#### Get Credentials

Add to your `.env`:
```
SLACK_BOT_TOKEN=xoxb-...      # OAuth & Permissions → Bot User OAuth Token
SLACK_SIGNING_SECRET=...       # Basic Information → Signing Secret
SLACK_APP_TOKEN=xapp-...       # Basic Information → App-Level Tokens (if using Socket Mode)
```

### 4. Configure Bitbucket Webhook

1. Go to your Bitbucket repository → **Repository settings** → **Webhooks**
2. Click **Add webhook**
3. Configure:
   - Title: `PR Tracker`
   - URL: `https://your-domain.com/webhooks/bitbucket`
   - Triggers: Select all **Pull Request** events:
     - Created
     - Updated
     - Approved
     - Unapproved
     - Changes request created
     - Changes request removed
     - Comment created
     - Merged
     - Declined
4. (Optional) Set a secret and add to `.env`:
   ```
   WEBHOOK_SECRET=your-secret-here
   ```

Repeat for each repository you want to track.

### 5. Start the Application

#### Using Docker (Recommended)

```bash
docker-compose up -d
```

This starts PostgreSQL and the app. The app will be available at `http://localhost:3000`.

#### Manual Setup

```bash
# Start PostgreSQL separately
docker-compose up -d postgres

# Run database migrations
npm run db:migrate

# Start in development mode
npm run dev
```

## Usage

### Account Linking

Users are automatically linked when their Bitbucket email matches their Slack email. For users with different emails, an admin can manually link accounts:

```
/pr admin link "Display Name" @slack-user
```

### Available Commands

| Command | Description |
|---------|-------------|
| `/pr help` | Show all commands |
| `/pr my-reviews` | List PRs waiting for your review |
| `/pr my-prs` | List your open PRs with status |
| `/pr status workspace/repo/123` | View specific PR details |
| `/pr nudge workspace/repo/123` | Remind pending reviewers |
| `/pr mute` | Disable DM notifications |
| `/pr unmute` | Enable DM notifications |
| `/pr admin` | Admin commands (requires `SLACK_ADMIN_USER_ID`) |

### Notification Rules

| Event | Who Gets Notified |
|-------|-------------------|
| PR Created | All reviewers |
| PR Updated | Reviewers who requested changes |
| Changes Requested | PR author |
| All Approved | PR author |
| Comment Added | PR author (if commenter ≠ author) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SLACK_BOT_TOKEN` | Yes | Slack Bot OAuth token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Yes | Slack app signing secret |
| `SLACK_APP_TOKEN` | No | Slack app token for Socket Mode (`xapp-...`) |
| `SLACK_ADMIN_USER_ID` | No | Slack user ID for admin commands (`U...`) |
| `WEBHOOK_SECRET` | No | Secret for validating Bitbucket webhooks |
| `PORT` | No | Server port (default: 3000) |
| `AI_REVIEW_REPO_PATH` | No | Absolute path to a checkout of the reviewed repo; enables the dashboard's "Request AI review" button |
| `AI_REVIEW_PLUGIN_PATH` | No | Claude Code plugin holding the review command (default: `ai-review/code-review-bitbucket` in this repo) |
| `AI_REVIEW_COMMAND` | No | Slash command to run (default: `/code-review-bitbucket:code-review`) |
| `AI_REVIEW_CLAUDE_BIN` | No | Claude Code binary (default: `claude`) |
| `AI_REVIEW_BITBUCKET_MCP_COMMAND` | No | Command starting the Bitbucket MCP server (default: `npx -y @aashari/mcp-server-atlassian-bitbucket`; the Docker image uses its preinstalled `mcp-atlassian-bitbucket`) |
| `AI_REVIEW_BITBUCKET_EMAIL` / `AI_REVIEW_BITBUCKET_API_TOKEN` | No | Credentials for the review's MCP server; the token must include `write:pullrequest` to post the comment (default: `BITBUCKET_EMAIL` / `BITBUCKET_API_TOKEN`) |
| `AI_REVIEW_TIMEOUT_MINUTES` | No | Kill a review that runs longer than this (default: 30) |
| `APP_UID` / `APP_GID` | No | Host uid/gid the app container runs as, so it can use the mounted `~/.claude` credentials (default: 1000) |

## AI Code Review

When `AI_REVIEW_REPO_PATH` is set, a developer signed in with Slack sees **Request AI review** on their own open pull requests. The tracker runs the review command shipped in `ai-review/code-review-bitbucket` (`/code-review-bitbucket:code-review`, always on Sonnet at medium effort) headless from that checkout, so the command can load the repo's skills and CLAUDE.md files; the command reads the diff through the Bitbucket MCP server and posts each finding as an inline comment on the line it concerns, or a single general comment when nothing is found. It is a code-reading review: the headless session has no shell, so it never runs tests, linters or builds.

Rules:
- Only the PR author can request it, and each PR gets one review. Only a failed run can be retried.
- Reviews run one at a time; the dashboard shows `queued` / `running` / `AI reviewed` / `failed` on the PR row and the author gets a Slack DM when it finishes.
- The Docker image ships the Claude Code CLI and mounts your `~/.claude` (OAuth login, settings, project memory); run `claude` once on the host to log in. Bitbucket access uses `AI_REVIEW_BITBUCKET_EMAIL` / `AI_REVIEW_BITBUCKET_API_TOKEN`, falling back to `BITBUCKET_EMAIL` / `BITBUCKET_API_TOKEN`; the token must be allowed to write pull request comments.

## Health Check

Verify the app is running:

```bash
curl http://localhost:3000/health
```

## Troubleshooting

### Users not receiving notifications

1. Check if user is auto-linked (emails must match between Bitbucket and Slack)
2. If emails differ, admin can link manually: `/pr admin link "Name" @user`
3. Verify the bot has permission to DM the user
4. Check if user has muted notifications: `/pr unmute`

### Webhooks not working

1. Check the webhook URL is publicly accessible
2. Verify the webhook secret matches (if configured)
3. Check server logs for incoming webhook events

### Database connection issues

1. Ensure PostgreSQL is running: `docker-compose ps`
2. Verify `DATABASE_URL` in `.env` is correct
3. Run migrations: `npm run db:migrate`

## Development

```bash
npm run dev          # Start with hot reload
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run build        # Compile TypeScript
```

### Database Commands

```bash
npm run db:generate  # Regenerate Prisma client
npm run db:migrate   # Create and apply migrations
npm run db:push      # Push schema changes (dev only)
```

## License

[ISC](LICENSE)
