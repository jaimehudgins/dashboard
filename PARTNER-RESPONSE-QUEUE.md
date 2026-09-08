# Partner response queue and scheduled preparation

Attention now has a saved **Partner responses** queue: Needs response, Draft ready,
Needs your input, Waiting / follow-up, and Handled. Open a row to save notes,
prepare/edit a reply, set a follow-up date, or reopen previous drafts. The Mail
link opens the actual conversation, with a current saved draft ready for review.
Sending remains an explicit action in Mail; nothing sends automatically.

## Enable after deployment

1. Run [`partner-response-queue.sql`](partner-response-queue.sql) in **Leo's**
   Supabase SQL editor, not TEMU's. It creates private, server-only tables and
   revision/locking functions. Do not replace existing tables or disable RLS.
2. Add `SUPABASE_SERVICE_ROLE_KEY` from that same Leo Supabase project to Leo's
   Vercel server environment. Never use a `NEXT_PUBLIC_` prefix, paste the value
   into a task, or commit it. Redeploy after changing environment variables.
3. Existing Google OAuth and `GOOGLE_REFRESH_TOKEN` must belong to
   `LEO_ALLOWED_EMAIL` and support Gmail access/labels. No additional Google
   scope is introduced. The read-only CRM connection must work. Drafting uses
   the existing `ANTHROPIC_API_KEY` and reply-source integrations.
4. Open **Attention → Partner responses → Check mail**. The initial import is
   deliberately limited to the newest 100 inbox conversations, processed in
   batches of 50. Continue checking until “Last complete mail check” appears.
   Older unimported inbox threads remain in Mail and enter the queue when they
   change. Not every imported conversation is a partner conversation.

Without the new key, existing Mail/classification continue working. A configured
queue with missing tables or failed sync displays an error; it does not silently
substitute an expensive inbox scan. Removing the key disables the queue without
deleting its saved data.

## Enable automatic preparation (optional, off by default)

1. After the queue migration, run `partner-response-preparation.sql` in Leo's
   Supabase. It adds private batch history and per-message preparation tracking.
2. Set `LEO_AUTO_DRAFTS_ENABLED=true` in Leo's Vercel server environment and
   redeploy. Scheduled runs also need `CRON_SECRET`, `GOOGLE_REFRESH_TOKEN`, and
   `ANTHROPIC_API_KEY`. No additional Google or Slack scopes are needed.
3. Attention shows **Reply preparation on**, the latest window's results, failures,
   and **Run current window**. That button executes one bounded pass, not a
   duplicate batch. After a completed window, new arrivals wait for the next one.

Windows start at **8 AM, 11 AM, 2 PM, and 4:45 PM Central on weekdays**, including
daylight-saving changes. A five-minute worker resumes unfinished windows until
6 PM; those checks do not create new batches. If mail is stale, a check syncs it
first and preparation resumes on the next check. These are start times, not
guaranteed completion times. No late-night/weekend catch-up is enabled.

Pilot limits: at most 12 conversations per window, or 4 in the final window to
target completion before 5 PM. Each worker handles at most two, with a time
budget. Only the last seven days of inbox conversations are eligible. Older mail
and overflow remain visible for manual review or a later eligible window.
Unfinished old batches become superseded when a new window starts; still-eligible
work is reconsidered, not deleted.

Only matched, unresolved conversations without an existing draft are eligible.
High-confidence, supported routine replies can become Draft ready. Platform
changes (including named ALMA reviewers), sensitive data, pricing/contracts,
uncertainty, and missing evidence require your input. FYIs get a no-reply
suggestion, never automatic closure. Platform questions require platform
guidance, curriculum questions require Drive evidence, and implementation
questions require CRM evidence. Other source requirements come from the full-thread
assessment. Source availability does not guarantee correctness: review every draft.

Each item shows Leo's preparation decision. Model/source failures leave the email
eligible for a later window and show a batch error. Successful assessments are
remembered per message. Repeated checks cannot overwrite your edits or regenerate
the same message. New arrivals can be reconsidered, but older saved drafts are
never automatically replaced; use **Prepare a fresh draft** yourself. Set
`LEO_AUTO_DRAFTS_ENABLED=false` and redeploy to disable background preparation
without deleting saved work.

Existing urgent Slack alerts and morning/evening briefs remain in place. This
phase does not send four additional Slack notifications per day.

## Behavior and limits

- The existing 15-minute classification cron now follows Gmail history changes,
  including sent replies, labels, and deletions. No cron schedule changed.
  Opening Today/Attention reads saved data; it does not trigger Gmail sync.
- The cursor advances only after a successful page. A database lease prevents
  overlapping checks. Interrupted work is replayed safely. An expired Gmail
  cursor triggers a full inbox listing plus every tracked thread, then resumable
  50-thread recovery batches; completion is not reported while batches remain.
- Partner matches use TEMU contacts/organization domains. Ambiguous threads
  require review; Leo never creates partners. Use Mail's existing TEMU review
  flow to confirm a partner. This queue does not write to TEMU.
- Reading a message does not resolve it. Mark it Handled yourself. A new partner
  message reopens it; an outgoing reply moves it to Waiting. New arrivals retain
  earlier drafts but flag them as outdated. Updates use version checks to avoid
  overwriting another tab's edits. Manual changes require **Save changes** or
  **Save draft**; there is no autosave.
- Drafts are stored in Leo, not Gmail Drafts. Replaced drafts are retained in
  Previous drafts. Source links accompany generated replies. Review factual
  claims before sending; a draft-ready label is not a correctness guarantee.
- Slack urgent alerts use saved unresolved, confidently classified partner
  messages and existing deduplication. Daily briefs use saved status/follow-ups
  and warn when the last complete check is over 30 minutes old or incomplete.
- A combined send/task/TEMU confirmation is **not included in this stage**.
  Follow-up dates inform the queue and brief, not a separate reminder scheduler.

## Verification

```bash
node scripts/check-partner-queue.mjs
node scripts/check-partner-preparation.mjs
npx tsc --noEmit
npm run lint
npm run build
```

The focused regression scripts are offline: state changes, history events, cursor
replay, recovery, batching, matching, concurrent edits, DST-aware preparation,
source requirements, and automatic-drafting guards. They use mocks, not
Gmail or production Supabase. Repository-wide lint has pre-existing failures;
compare changed files against the baseline. A build needs Google Fonts access.

After setup, pilot one real partner thread:

1. Check mail; confirm a recent partner email appears even if already read.
2. Prepare a draft, edit/save it, reload, and confirm the text/source links remain.
3. Open it in Mail; confirm the correct conversation and saved draft load.
4. Mark Handled, check mail after a read/label change, and confirm it stays handled.
5. After a genuine new reply, check mail: it should reopen, with the earlier draft
   preserved and marked outdated. Do not send test mail to a partner just to test.
6. Try saving from two tabs: the second outdated save should report a conflict
   without discarding the first edit. Check Previous drafts after replacement.
7. Confirm the next cron updates the last-check time and the next briefing reflects
   queue state. Never invoke a sending cron merely as a read-only diagnostic.

For the automatic preparation pilot, use **Run current window** during weekday
work hours. Repeat if the first pass needed to sync or still has work waiting.
Confirm a routine reply is saved, a platform-change request gets an explanation
under Needs your input, and existing drafts stay untouched. Do not send emails
just to test preparation. Live source/model quality and the SQL migrations still
need verification in the deployed environment.

Protocol reference: [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync).
