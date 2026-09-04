FROM node:22-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner

ARG APP_UID=1000
ARG APP_GID=1000
ARG CLAUDE_CODE_VERSION=2.1.258
ARG BITBUCKET_MCP_VERSION=3.1.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@aashari/mcp-server-atlassian-bitbucket@${BITBUCKET_MCP_VERSION}" \
  && mkdir -p /home/app \
  && chown -R "${APP_UID}:${APP_GID}" /home/app

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY ai-review ./ai-review
COPY package*.json ./

ENV NODE_ENV=production
ENV HOME=/home/app
ENV CLAUDE_CONFIG_DIR=/home/app/.claude
ENV AI_REVIEW_BITBUCKET_MCP_COMMAND=mcp-atlassian-bitbucket

USER ${APP_UID}:${APP_GID}

EXPOSE 3000

CMD ["npm", "start"]
