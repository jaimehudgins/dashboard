# Leo — Phase 0 Checklist (Foundation)

Working branch: `leo-phase-0`. Goal: rename to Leo, layer NextAuth+Google OAuth on top,
add `memory`+`quotes` tables, swap the tasks header/empty-state, scaffold Vercel cron.
Constraint: existing dashboard stays working at every commit. No new database (existing
dashboard Supabase project). RLS stays allow-all; **NextAuth is the actual gate.**

## Locked decisions
1. Google account: **jaime@willowed.org**
2. OAuth client: **new** (separate from PMA)
3. Publishing status: **Testing** (single user; ~7-day refresh-token expiry → weekly re-sign-in)
4. Tasks empty state: **B** — caught-up reward only when no filter/search is active.

## Setup done by Jaime (out of codebase)
- Vercel project renamed to "leo" + new domain; env vars set in Vercel (prod NEXTAUTH_URL = new domain)
- New Google OAuth client; Gmail/Drive/Calendar APIs enabled
- Scopes on consent screen: calendar (full), gmail.modify, gmail.send, gmail.compose, drive.readonly
- jaime@willowed.org added as test user (staying in Testing)
- `.env.local`: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_URL, NEXTAUTH_SECRET

---

## ① Branding rename — DONE (commit 86b3110)
- [x] package.json name → leo
- [x] layout.tsx metadata title → Leo
- [x] Sidebar.tsx h1 → Leo
- [x] README.md → Leo intro
- Nav label "Command Center" left as-is (separate from page H1).

## ② Tasks header + empty state — DONE (commit 16189e1)
- [x] AnalyticsDashboard.tsx H1 → "What's next?"
- [x] UnifiedTaskTable.tsx empty state → conditional (Option B)

## ③ Supabase tables — SQL WRITTEN (commit 06d1d1d); **YOU run it**
- [x] `memory-table.sql` written (build-plan schema + allow-all RLS)
- [x] `quotes-table.sql` written (schema + 6 seed rows + allow-all RLS)
- [ ] **Run both in the dashboard Supabase project `wsxgofbgpptlfxtcqnlx` SQL editor (NOT the CRM project)**

## ④ NextAuth + Google OAuth — DONE
- [x] `next-auth@^4.24.14` installed
- [x] `src/lib/auth.ts` (single-email allowlist; all scopes incl. gmail.compose) — commit a03d09d
- [x] `src/app/api/auth/[...nextauth]/route.ts`
- [x] `src/types/next-auth.d.ts`
- [x] `src/components/SessionProviderWrapper.tsx` + wired into `layout.tsx`
- [x] `src/app/auth/signin/page.tsx` + `src/app/auth/error/page.tsx` (plain, Leo-branded)
- [x] `src/middleware.ts` — the gate, added last — commit 10af27f
- [ ] **YOU: browser sign-in test (see below) — the OAuth handshake I can't run myself**

## ⑤ Vercel cron scaffolding — DONE (commit 7b3fed4)
- [x] `vercel.json` — one placeholder daily cron
- [x] `src/app/api/cron/health/route.ts` — guarded by CRON_SECRET (enforced only when set)
- [ ] (optional) add `CRON_SECRET` in Vercel to enforce the guard

---

## Verified by me
- `npm run build` clean; all routes compile; `ƒ Proxy (Middleware)` active (gate wired); TypeScript passes.
- Dev probes (before gate): providers endpoint returns Google w/ correct callback; sign-in page 200; cron route `{"ok":true}`.

## Remaining for you (before merge)
1. Run the two SQL files in the dashboard Supabase project.
2. `npm run dev` → confirm `/` redirects to `/auth/signin` → Google consent (click through the
   "unverified app" screen) → lands back in Leo. Then click around every route.
3. Push the branch / deploy preview and repeat the sign-in test on the Vercel domain (prod
   NEXTAUTH_URL + redirect URI must match exactly).
4. (optional) Set CRON_SECRET in Vercel.

## Risks to test
- Sign-in must work local **and** prod (NEXTAUTH_URL / redirect URI mismatch is the #1 failure).
- After sign-in, every route loads; signed-out hits redirect to /auth/signin.
- Quick Capture, Focus session, CRM bridge (/partner-tasks), dark mode all still work.
- Testing mode → refresh token expires ~weekly → expect periodic re-sign-in (by design).

## Known minor follow-ups (not blocking)
- Next 16.1 deprecates `middleware.ts` in favor of `proxy.ts` (warning only; still works). Migrate later.
- /auth pages render inside the full provider tree (AppProvider etc.); harmless, could use a bare
  route-group layout later.
- No sign-out button in the sidebar yet (single-user; easy to add on request).
- `Leo Upgrades/leo-build-plan.md` is untracked in git — commit if you want it versioned.
