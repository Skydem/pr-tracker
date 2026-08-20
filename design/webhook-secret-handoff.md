# Handoff: Bitbucket webhook signature verification

Repo: Skydem/pr-tracker. Work on a NEW branch off main —
`claude/webhook-signature-verification`. Do not touch
`claude/pr-status-dashboard-design-pkegjo`; another session owns it.

Fix Bitbucket webhook signature verification, which is broken in two ways that
have to be fixed together.

1. **Fails open.** `src/webhooks/bitbucket.handler.ts:21` —
   `if (!config.webhookSecret) return true;` — accepts every unsigned request
   when `WEBHOOK_SECRET` is unset, and `src/config/env.ts:33` defaults it to `""`.
   The app is publicly reachable at `pr.torbust.work` via Traefik, so anyone with
   the hostname can POST forged PR events, write to the database and make the bot
   DM real people.

2. **Hashes the wrong bytes.** `bitbucket.handler.ts:51` computes
   `JSON.stringify(req.body)` AFTER `express.json()` has parsed it
   (`src/index.ts`). HMAC must run over the exact raw payload — re-serializing
   changes key order and spacing, so the digest will not match what Bitbucket
   signed. Setting a secret today would reject all legitimate webhooks.

## What I'd like

- Capture the raw body:
  `express.json({ verify: (req, _res, buf) => { (req as RawBodyRequest).rawBody = buf } })`,
  and HMAC that Buffer.
- Fail closed: reject unsigned/mis-signed requests when a secret is set. Require
  `WEBHOOK_SECRET` in production (make it `requireEnv`, or throw at startup when
  `NODE_ENV=production` and it is empty) while still allowing local dev without
  one. Log loudly when verification is disabled.
- Keep `crypto.timingSafeEqual`, keep the existing length guard before it, and
  keep accepting the `sha256=` prefix.
- Extend `tests/webhook.handler.test.ts`: valid signature passes, tampered body
  401s, missing signature with a secret set 401s, and a payload whose key order
  differs from its serialization still validates (this is the regression test
  for bug 2).

## Conventions

CLAUDE.md says never add comments — self-explanatory names only. ES modules with
`.js` import extensions, vitest via `npm test`. Run the full suite before
pushing; several existing webhook tests may need updating for the raw-body
change.

Verify against Bitbucket Cloud's current docs for the `X-Hub-Signature` header
format rather than assuming — confirm whether it is sha256 and whether the
prefix is always present.

Push the branch. Do not open a PR unless asked.
