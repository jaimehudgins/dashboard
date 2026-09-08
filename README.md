# Leo

Your chief of staff. An operating layer for the CAO role — tasks, calendar, email,
meetings, partner attention, and chat — built on Next.js, Supabase, and Vercel.

Leo is the evolution of the strategic dashboard. See `Leo Upgrades/leo-build-plan.md`
for the phase-by-phase roadmap.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Local config lives in `.env.local` (gitignored). Required keys:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Leo's own Supabase project
- `NEXT_PUBLIC_CRM_SUPABASE_URL`, `NEXT_PUBLIC_CRM_SUPABASE_ANON_KEY` — read-only TEMU CRM bridge
- `TEMU_API_BASE_URL`, `TEMU_API_KEY` — server-only, approval-gated TEMU exports
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `LEO_ALLOWED_EMAIL` — Google sign-in (Phase 0)

## Partner response queue

Setup and testing for the saved Attention queue and incremental Gmail sync are in
[PARTNER-RESPONSE-QUEUE.md](PARTNER-RESPONSE-QUEUE.md). This optional feature needs
`partner-response-queue.sql` in Leo's Supabase and its server-only
`SUPABASE_SERVICE_ROLE_KEY`; never expose that key in browser configuration.
