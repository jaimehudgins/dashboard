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
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `LEO_ALLOWED_EMAIL` — Google sign-in (Phase 0)
