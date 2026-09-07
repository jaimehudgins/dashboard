# Codex project guide

Leo is a Next.js 16 App Router application backed by Supabase and deployed on Vercel. Use Node.js 20+ and npm; `package-lock.json` is authoritative.

## Setup and commands

```bash
npm ci                 # install exactly from package-lock.json
npm run dev            # development server at http://localhost:3000
npm run lint           # ESLint (Next.js core-web-vitals + TypeScript)
npx tsc --noEmit       # type-check; there is no package script for this
npm run build          # production Next.js build
npm run start          # serve the completed production build
```

There is currently no automated test framework or `test` script. For changes, run lint, type-check, and build; manually exercise affected routes when practical. Do not invent or document `npm test` until a test runner is added.

## Environment

Create a gitignored `.env.local`. The application core needs:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CRM_SUPABASE_URL`, `NEXT_PUBLIC_CRM_SUPABASE_ANON_KEY` (read-only CRM bridge)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `LEO_ALLOWED_EMAIL`

Feature integrations additionally use `ANTHROPIC_API_KEY`, `GOOGLE_REFRESH_TOKEN`, `GRANOLA_API_KEY`, `GITHUB_TOKEN`, `GITHUB_CURRICULUM_REPO`, `MCP_TOKEN`, `CRON_SECRET`, `TEMU_API_BASE_URL`, and `TEMU_API_KEY`. Slack search uses `SLACK_SEARCH_TOKEN` (with legacy `SLACK_TOKEN` support); Slack alerts and daily briefs use `SLACK_BOT_TOKEN` plus `SLACK_ALERT_USER_ID` or `SLACK_ALERT_CHANNEL_ID`. Inbound Slack DMs additionally require `SLACK_SIGNING_SECRET`, the `im:history` bot scope, and a `message.im` event subscription pointed at `/api/slack/events`; only `SLACK_ALERT_USER_ID` is accepted. Workbench Drive retrieval can be anchored with `GOOGLE_DRIVE_CURRICULUM_FOLDER_ID` and `GOOGLE_DRIVE_PARTNER_SUCCESS_FOLDER_ID`; without them Leo attempts an exact-name lookup for “Willow Curriculum 2.0” and “Partner Success.” Keep secrets server-only; only Supabase browser configuration belongs in `NEXT_PUBLIC_*`. TEMU writes must go through the server-only TEMU API and require an explicit user confirmation; do not add browser-side CRM writes. Never commit or print `.env.local` values. Database tables are managed by the root-level SQL migration files; apply them deliberately in Supabase, not as part of normal app startup. `leo-notifications.sql` is required before enabling Slack notification sends; `leo-slack-inbound.sql` is required before processing Slack DMs.

## Architecture and boundaries

- `src/app/`: App Router pages, layouts, and route handlers. Server/API behavior belongs in `src/app/api/`; add `"use client"` only to components requiring browser APIs, hooks, or context.
- `src/components/`: UI and feature components. Keep external-service and persistence logic in `src/lib/` rather than adding new direct clients in components.
- `src/lib/`: Supabase data access and Google, Anthropic, Granola, GitHub, Slack, Gmail, calendar, TEMU, and MCP integrations. Preserve the separation between Leo's primary `supabase` client, the read-only `crmSupabase` bridge, and server-only TEMU writes.
- `src/store/store.tsx`: shared client application state; `src/types/`: shared domain and module types.
- `src/app/api/[transport]/route.ts`: Leo's MCP tool surface. Preserve its optional bearer-token guard and confirmation expectations for external write operations.
- `vercel.json`: production cron schedule. Cron handlers must continue to validate `CRON_SECRET` when configured.

Use strict TypeScript, the `@/*` alias for `src/*`, functional React components, and existing App Router patterns. Match the established style: two-space indentation, double quotes, semicolons, and trailing commas. Handle Supabase/API errors explicitly and avoid weakening types with `any`.

## Files and safety

Do not edit generated or installed output: `node_modules/`, `.next/`, `out/`, `build/`, `coverage/`, `next-env.d.ts`, or `*.tsbuildinfo`. Do not edit `.env.local` unless the task explicitly requires environment configuration. `curriculum_seed_data.json` is seed input; `scripts/seed-curriculum.mjs` performs remote inserts and must not be run during routine verification. Preserve `.claude/` and any future `CLAUDE.md` for Claude Code compatibility.
