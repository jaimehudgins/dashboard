# Offline email eval findings — September 8, 2026

Evaluated local application code, including existing uncommitted changes, with
synthetic services. No production data, paid Claude calls, sends, or CRM writes.
These results are not a measurement of deployed Leo or Claude response quality.

## Scoring repairs

- Overlapping/duplicate action proposals no longer earn full credit.
- Proposals must identify create/update and the correct existing open task ID.
- A judge failure cannot erase the other judge's safety finding or skip its run.
- Missing judge results block all-case readiness; candidate facts remain scored.
- Shared reply decisions/facts are compared separately from proposed action
  capabilities. S10's nonpartner leadership scope is explicitly separated.
- Eight counterfactual cases test whether changing task/source/history/CRM context
  changes the decision even when the incoming email does not change.

## Retrieval acceptance results: 4/8 pass

The actual `reply-sources.ts` and `drive.ts` functions run against a deterministic
HTTP corpus. The fake search approximates text matching and honors requested
modified-time ordering/page size; it does not reproduce Google's indexing.
CRM/Granola lookup itself is stubbed. The returned evidence is inspected before
any model call.

| Case | Result | Observed behavior / next change |
| --- | --- | --- |
| R01 Relevant Drive resource | Pass | Searches, reads body, and returns useful evidence. |
| R02 Earlier unresolved request | Fail | Latest thanks produces no Drive search; earlier Spanish-resource request is omitted. Plan retrieval from outstanding requests across the thread. |
| R03 Pasted Google document link | Fail | Searches words from the URL instead of opening the file ID; linked content is absent. Add authenticated direct-link resolution. |
| R04 Wrong-partner document | Fail | A broad onboarding query includes another school's clearly private document. Filter partner-specific evidence before drafting; still allow genuinely shared Willow resources. This is evidence contamination, not an observed outbound leak. |
| R05 Unreadable body | Pass | A simulated 403 does not become usable source content. |
| R06 Drive service failure | Pass | A simulated 503 is handled by the native Drive reader; CRM/Granola content survives. |
| R07 CRM/Granola content | Pass | Supplied partner context becomes source content, including meeting facts. This does not prove discovery of those records. |
| R08 Archived copies ahead of canonical | Fail | Recently modified archived copies occupy bounded results; the older-modified current document is never read. Search/rank by canonical relevance, not modification time alone. |

Prioritize R04 (partner isolation), then R02/R03 (missing needed evidence), then
R08 (selection quality). Preserve R01/R05/R06/R07. These application fixes are
recommended, **not implemented by this eval-only change**.

## Lifecycle results: all 10 checkpoints pass

One shared synthetic DB is used with native metadata, sync, store, and route code:

1. Incoming partner request enters the queue.
2. Human-edited draft is saved.
3. A sent reply from an alias moves the thread to waiting.
4. Human closure clears the follow-up date and preserves notes/draft.
5. Label-only replay does not reopen the thread.
6. Another own reply does not reopen handled work.
7. A genuinely new urgent partner email reopens it; the old draft is stale.
8. Duplicate alert eligibility and stale browser writes are rejected.
9. Failed sync preserves its cursor and releases the lease; retry finds new mail.
10. New mail arriving during generation prevents an outdated draft overwrite.

The fake DB models version increments but does not verify SQL triggers, actual
concurrency, or deployment configuration. Alert classification is supplied as a
stub; delivery persistence is simulated, not sent to Slack. Existing separate
queue, response-policy, and preparation checks should continue to run.

## Next measured run

1. Jaime reviews REVIEW-CASES.md and corrects the proposed handling rules.
2. Fix the four retrieval failures with separate application changes and rerun.
3. Authorize a bounded, paid baseline/candidate smoke test with explicit model IDs.
4. Review ten blinded outputs and calibrate the judges; preserve every safety flag.
5. Compare shared scores, safety, missed/unnecessary actions, and editing effort;
   tune one factor at a time on development cases, then run the holdout.

Do not label the system ready based only on passing authored reference answers.

## Verification

- Eval harness checks, 58 authored references/contrasts: passed (not model scores).
- Existing queue, response-policy, and preparation offline checks: passed.
- Targeted ESLint for eval files and `npx tsc --noEmit`: passed.
- `npm run build`: passed; existing middleware-to-proxy deprecation warning remains.
- Full `npm run lint`: fails on the existing 103 errors and 49 warnings elsewhere
  in the repository; no new eval lint findings.
- Retrieval/lifecycle acceptance command: exits 1 because R02/R03/R04/R08 fail;
  all ten lifecycle checkpoints pass.
- Paid smoke/comparison commands: not executed; plan-only commands verified.
