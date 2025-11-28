# PR Tracker

Pull Request tracking application that monitors Bitbucket Cloud PRs and sends Slack notifications to keep your team informed about code reviews.

## Features

- Tracks all PR events (created, updated, approved, changes requested, comments, merged)
- Sends Slack DM notifications to relevant team members
- Slash commands to check PR status and pending reviews
- User mapping between Bitbucket and Slack accounts

## Prerequisites

- Node.js 22+
- Docker and Docker Compose
- Bitbucket Cloud workspace with admin access
- Slack workspace with permission to create apps

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/Skydem/pr-tracker.git
cd pr-tracker
npm install
```

### 2. Create Environment File

```bash
cp .env.example .env
```

### 3. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**, name it "PR Tracker", select your workspace

#### Configure OAuth & Permissions

Navigate to **OAuth & Permissions** and add these Bot Token Scopes:
- `chat:write` - Send messages
- `commands` - Handle slash commands
- `users:read` - Look up users
- `users:read.email` - Match users by email

#### Create Slash Command

Navigate to **Slash Commands** and create:
- Command: `/pr`
- Request URL: `https://your-domain.com/slack/events`
- Description: `PR Tracker commands`
- Usage Hint: `[status|my-reviews|my-prs|link|nudge|help]`

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

### 5. Bitbucket API Credentials (Optional)

If you need to fetch additional PR data:

1. Go to Bitbucket → **Personal settings** → **App passwords**
2. Create app password with `Repositories: Read` permission
3. Add to `.env`:
   ```
   BITBUCKET_WORKSPACE=your-workspace
   BITBUCKET_CLIENT_ID=your-username
   BITBUCKET_CLIENT_SECRET=your-app-password
   ```

### 6. Start the Application

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

### 7. Expose to Internet

The app needs to be accessible from the internet for webhooks. Options:

#### Cloudflare Tunnel (Recommended for production)

```bash
cloudflared tunnel create pr-tracker
cloudflared tunnel route dns pr-tracker pr.yourdomain.com
cloudflared tunnel run pr-tracker
```

#### ngrok (For development)

```bash
ngrok http 3000
```

Update your Slack app and Bitbucket webhook URLs with the public URL.

## Usage

### Link Your Account

Each user needs to link their Bitbucket account to Slack:

```
/pr link your.email@company.com
```

Use the same email as your Bitbucket account.

### Available Commands

| Command | Description |
|---------|-------------|
| `/pr help` | Show all commands |
| `/pr my-reviews` | List PRs waiting for your review |
| `/pr my-prs` | List your open PRs with status |
| `/pr status workspace/repo/123` | View specific PR details |
| `/pr nudge workspace/repo/123` | Remind pending reviewers |
| `/pr link email@example.com` | Link your Bitbucket account |

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
| `BITBUCKET_WORKSPACE` | Yes | Your Bitbucket workspace slug |
| `BITBUCKET_CLIENT_ID` | Yes | Bitbucket username or OAuth client ID |
| `BITBUCKET_CLIENT_SECRET` | Yes | Bitbucket app password or OAuth secret |
| `WEBHOOK_SECRET` | No | Secret for validating Bitbucket webhooks |
| `PORT` | No | Server port (default: 3000) |

## Health Check

Verify the app is running:

```bash
curl http://localhost:3000/health
```

## Troubleshooting

### Users not receiving notifications

1. Ensure user has linked their account: `/pr link email@example.com`
2. Check the email matches their Bitbucket account email
3. Verify the bot has permission to DM the user

### Webhooks not working

1. Check the webhook URL is publicly accessible
2. Verify the webhook secret matches (if configured)
3. Check server logs for incoming webhook events

### Database connection issues

1. Ensure PostgreSQL is running: `docker-compose ps`
2. Verify `DATABASE_URL` in `.env` is correct
3. Run migrations: `npm run db:migrate`

## License

ISC
