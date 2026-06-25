# Leo — Phase 0 Checklist (Foundation)

Working branch: `leo-phase-0`. Goal: rename to Leo, layer NextAuth+Google OAuth on top,
add `memory`+`quotes` tables, swap the tasks header/empty-state, scaffold Vercel cron.
Constraint: existing dashboard stays working at every commit. No new database (use the
existing dashboard Supabase project). RLS stays allow-all; **NextAuth is the actual gate.**

## Locked decisions
1. Google account Leo authenticates: **jaime@willowed.org**
2. OAuth client: **new** (separate Google Cloud client from PMA — don't widen PMA's consent screen)
3. Publishing status: **Testing** (accept ~7-day refresh-token expiry → weekly re-sign-in)
4. Tasks empty state: **B** — "Nothing right now. Nice work." only when truly caught up;
   keep "No tasks match these filters." when a filter/search is narrowing the view.

---

## ① Branding rename  (text only — safe)
- [ ] `package.json` name → `leo`
- [ ] `src/app/layout.tsx` metadata title → `Leo`, description → chief-of-staff line
- [ ] `src/components/Sidebar.tsx` h1 → `Leo`
- [ ] `README.md` → short Leo intro
- Note: sidebar **nav label** "Command Center" left as-is (separate from the page H1; out of Phase 0 scope).

## ② Tasks header + empty state  (text only — safe)
- [ ] `AnalyticsDashboard.tsx` H1 "Command Center" → `What's next?`
- [ ] `UnifiedTaskTable.tsx` empty state → conditional (Option B):
      no filters active + zero rows → "Nothing right now. Nice work."; otherwise keep filter message.

## ③ Supabase tables  (I write SQL → YOU run it in the dashboard project's SQL editor)
- [ ] `memory-table.sql` (schema from build plan §Memory model) + RLS posture matching existing tables
- [ ] `quotes-table.sql` + seed (deterministic-per-date pick reads in stable order)
- [ ] Run both in Supabase project `wsxgofbgpptlfxtcqnlx` (NOT the CRM project)

## ④ NextAuth + Google OAuth  (mix of YOUR console work + my code)
YOUR steps:
- [ ] New Google Cloud OAuth client (Web). Redirect URIs: `http://localhost:3000/api/auth/callback/google`
      and `https://<vercel-domain>/api/auth/callback/google`
- [ ] Consent screen scopes: openid, email, profile, calendar, gmail.modify, gmail.send, drive.readonly
- [ ] Add jaime@willowed.org as a Test user
- [ ] Set env (`.env.local` + Vercel): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_URL, NEXTAUTH_SECRET, LEO_ALLOWED_EMAIL
MY code:
- [ ] `npm i next-auth@^4.24.13` (googleapis deferred to Phase 2)
- [ ] `src/lib/auth.ts` (ported; single-email allowlist; all scopes)
- [ ] `src/app/api/auth/[...nextauth]/route.ts`
- [ ] `src/types/next-auth.d.ts`
- [ ] `src/components/SessionProviderWrapper.tsx` + wrap in `layout.tsx`
- [ ] `src/app/auth/signin/page.tsx` (plain, Leo-branded — no ui/button, no willow-logo)
- [ ] `src/app/auth/error/page.tsx`
- [ ] `src/middleware.ts` — **add LAST**; matcher excludes `api`, `_next`, `auth`, assets

## ⑤ Vercel cron scaffolding  (additive)
- [ ] `vercel.json` with one placeholder daily cron
- [ ] `src/app/api/cron/health/route.ts` guarded by `CRON_SECRET`
- [ ] Set `CRON_SECRET` in Vercel

---

## Order of operations
1 → 2 → 3 → 4 (code + env, gate middleware LAST) → 5. Gate goes in only after sign-in is
verified locally **and** on Vercel, so the deploy never locks out.

## Risks to watch
- Testing-mode restricted scopes → refresh token expires ~weekly (re-sign-in). Production needs Google verification.
- Middleware before Vercel env = locked-out deploy. Env first, gate last.
- NEXTAUTH_URL must match the environment + the Google redirect URI exactly.
- Cron route must NOT be auth-gated (server-to-server call has no session) — matcher excludes `api`.
- Vercel Hobby: max 2 crons, daily only. Build plan's 5-min cadence needs Pro.
- Match new-table RLS to existing tables (anon access), or the browser anon key breaks.
- Don't edit dead `Focus3Dashboard.tsx` (not rendered).

## Pre-merge smoke test
`npm run build` clean; sign in works local+prod; every route loads post-auth
(`/`, `/partner-tasks`, `/archive`, `/notes`, `/review`, `/curriculum`, `/projects/[id]`);
Quick Capture + Focus + CRM bridge + dark mode all still work.
