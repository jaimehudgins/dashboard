# Partner response queue and scheduled preparation

## Calendar bucket

Attention's **Calendar** filter separates recognized invitations and event
notifications from Needs response, Draft ready, Action needed, Needs your input,
and Waiting. **All open** remains an inclusive view, **Critical now** retains
urgent notifications under its existing urgency/status rules, and handled items
remain in **Handled recently**. Calendar's two independently paginated sections:

- **Needs action:** invitations, declines, proposed times, changes, added questions,
  and notifications that have not yet been confidently assessed.
- **Updates only:** a current high-confidence full-conversation assessment says
  no reply/action remains (for example a simple acceptance or reminder).
  Current human decisions take precedence; new messages invalidate old assessments.

Recognition uses a notification subject plus calendar-specific envelope evidence
(dated event subject, notification sender, or calendar template snippet). Generic
scheduling discussion, human replies/forwards, and calendar links alone do not
qualify. These are conservative English-language format hints, not MIME/ICS
parsing or a live event/RSVP check; unfamiliar formats stay in the regular queue.
No event is accepted, declined, rescheduled, or automatically closed. The editor
links to Google Calendar to verify the actual event and RSVP manually.

No SQL migration is required. Existing saved notifications are routed on the next
queue load; recognizable incoming calendar notifications can enter the queue even
without a TEMU match. This does not backfill the entire Gmail mailbox: existing
history-sync/import limits still apply. Original statuses, drafts, and bulk scope
counts are preserved. Unassessed notifications stay actionable even before the
optional response-policy migration is installed.

Offline checks: `node scripts/check-calendar-email.mjs`,
`node scripts/check-response-lanes.mjs`, and `node scripts/check-partner-queue.mjs`.

## Saved responses

Each Attention row has an **Archive** button, so opening the conversation is not
required. Confirming archives in Gmail only; it does not mark the conversation
handled, change a follow-up date, or delete saved work. Already-archived rows show
**Not in inbox**. Stale-message/version checks and no automatic retries are shared
with the existing archive endpoint. On an uncertain result, check Gmail and use
Refresh list before retrying. Use **No follow-up needed** separately to close work.

Classification corrections take effect for the current message when saved. Future
assessments receive the five most recent corrections for the same matched partner,
not a continuously trained model or a universal rule. Explicitly approved email-type
rules can apply across partners. Already-assessed messages are not automatically
reprocessed after feedback/rule changes; use Assess response needs or bulk reassessment.
The scheduled worker processes at most two eligible conversations per five-minute
check, subject to backlog and failures. No-reply suggestions still require human
closure, so better classification alone does not empty Needs your input.

Attention now has a saved **Partner responses** queue: Needs response, Draft ready,
Action needed, Needs your input, Waiting / follow-up, and Handled. Open a row to save notes,
prepare/edit a reply, set a follow-up date, or reopen previous drafts. The Mail
link opens the actual conversation, with a current saved draft ready for review.
Attention also offers **Review & send**: it saves edits, verifies the current
Gmail recipient (honoring Reply-To), and shows the subject and reply text before
**Confirm & send**. Choose **Reply to sender** (default) or **Reply all** in that
window. Reply all includes the latest email's Reply-To/sender, To, and Cc lists;
it deduplicates addresses and excludes the signed-in account and known send-as
addresses from this thread's SENT messages. Other Willow colleagues stay included.
It never retrieves or adds Bcc, and it does not add people who only appeared in
older messages. Unusual/malformed address headers block Reply all rather than
guessing. Review the displayed To/Cc list, especially if you use additional aliases
not seen in this conversation. Mail remains available. Nothing sends automatically.

The authenticated `/api/partner-responses/send` route rechecks the saved version,
draft's source message, selected reply mode, To/Cc recipients, and latest Gmail message before sending. It
consumes the reviewed queue version so duplicate submissions of that version
cannot both send. Gmail writes are not automatically retried. If delivery cannot
be confirmed, inspect Mail/Gmail before reviewing another send; this is not a
cross-system exactly-once guarantee. A new message can still arrive between the
last check and Gmail accepting the send.

Confirmed sends keep the conversation in Needs your input until the latest sent
message is synced and assessed, without completing tasks or changing TEMU.
They also move the sent draft and its sources into
Previous drafts and clear the active reply box using the existing atomic revision
trigger. No new SQL migration is required for draft retirement. If bookkeeping fails after Gmail confirms delivery, Leo
shows a successful-send warning rather than encouraging a duplicate reply.
No additional migration, environment variable, or OAuth scope is required.

Run `node scripts/check-partner-send.mjs` for offline send/preview/duplicate-click
checks. To verify the deployed UI safely, edit an existing draft, choose Review
& send, verify its recipient/text, and choose Back to editing. Only click Confirm
& send for a reply you actually intend to deliver.

The Attention review panel also loads the email conversation on demand above
the draft. The latest message is expanded; earlier messages and quoted text can
be opened without leaving the panel. It labels the message used for a saved
draft and warns about newer incoming replies. When the latest email is your own
sent reply, it instead says you have already replied and are waiting for the
partner (or preserves no-follow-up-needed wording for Handled conversations).
Refresh emails reloads the conversation **and** reconciles reply status. Save
unsaved edits first; refreshing is disabled while edits or another action are
pending, so a refreshed queue entry cannot overwrite your text. Initial opening
remains read-only. Google links remain clickable.

If an already-answered thread still says Needs response, open it and use **Check
reply status** (save any edits first). This checks that one Gmail conversation
immediately. Your sent reply alone no longer means Waiting: use Assess response
needs after reconciliation. Legacy automatic Waiting entries return to Needs
your input; a current explicit Waiting correction or verified question is retained.
Gmail's per-message SENT flag handles aliases; an old sent message does not hide
a newer partner reply. Unsent drafts and Handled decisions are retained. Replies
sent as a separate Gmail conversation are not automatically linked by this check.

Mail sync and **Check reply status / Refresh emails** also repair drafts sent
outside Attention: they check the full thread for a Gmail SENT message after the
draft's source message with matching text (ignoring whitespace, optionally without
quoted history). The match can be an earlier message followed by a new partner
reply. Different wording/signatures, missing source messages, truncated bodies,
and incoming copies are not proof of sending: those drafts stay untouched.
If Gmail changes during lookup, the check retries instead of clearing text.
Older already-sent drafts can be repaired with Check reply status even without a
new incoming email. Save unsaved edits first. Nothing is sent by this repair.

A new incoming email is assessed independently. Once the old sent draft is out
of the active box, a high-confidence Reply needed assessment permits preparation
in the next eligible scheduled window (or manual Draft with Leo). Waiting/no-reply
assessments do not produce a needless reply. Unsent drafts still block automatic
replacement; review and replace them manually when appropriate.

Use **No follow-up needed** in the open conversation when nothing else needs
doing. It saves current notes/draft edits, clears the follow-up date, and moves
the conversation out of All open into Handled recently. Nothing is sent or
archived in Gmail. Read/label changes and your own additional sent messages do
not reopen it. A new incoming message reopens it on the next mail check (normally
within 5 minutes); you can also reopen it manually using Status and Save changes.

## Archive from Attention

**Archive in Gmail** is available near the top of an Attention conversation.
Save any unsaved edits first, then confirm the archive. It removes the thread
from the Gmail inbox without deleting it or changing Leo's follow-up status,
notes, draft, or follow-up date. Restore it using **Move to Inbox** in Gmail.
Use **No follow-up needed** separately when you also want to close Leo's work.
Archived conversations can therefore remain in Attention; they show **Not in
Gmail inbox**. New incoming mail is handled by normal mail sync.

The archive route checks the authenticated Google account, reviewed queue
version, and latest Gmail message before archiving. It consumes that version
to prevent duplicate submissions and never automatically retries a Gmail write.
Gmail cannot atomically combine thread archive with the latest-message check;
if new activity arrives during the operation, the UI asks you to check Gmail.
If delivery of the archive request is uncertain, check reply status before
trying again. No migration or new OAuth scope is required.
Run `node scripts/check-partner-archive.mjs` for offline regressions.

## Response-needed policy

Run **`partner-response-policy.sql` after both migrations below**, in Leo's
Supabase, then deploy. No additional environment variables are required.
Without this migration, the queue and manual Mail tools remain available, but
new automatic drafts wait for response assessment. Attention displays setup
guidance. Existing drafts are retained.

The five-minute mail cron also assesses at most two pending conversations using
the full available email thread, directly linked Work tasks, and the five latest
corrections for that TEMU partner. Assessments are independent of draft research:
this pass does not search all Drive/CRM content or verify platform changes.
Truncated/overlong threads and unavailable task context require human judgment.
Results are saved per latest-message ID; label/read changes do not repeat model
work. A separate lease prevents overlapping assessment workers. Large backlogs
take multiple checks; a slow mail sync defers assessment to the next check.
Failed assessments back off for 30 minutes so they do not block other threads;
the last error is shown in Attention. Manual reassessment can retry immediately.

In an Attention conversation, **Assess response needs** runs an immediate review
(save edits first). Leo explains one of five recommendations:

- Reply needed: an unanswered email request or commitment needs an answer.
- Action only: work remains, but an email response is unnecessary (such as adding
  named ALMA reviewers). Saved human decisions and current high-confidence
  assessments appear in Action needed; uncertain assessments stay in Needs your
  input. Check Work for an existing task, or use Add task in Mail.
  This policy does not create tasks or perform platform changes.
- Waiting on partner: Jaime asked a specific, still-unanswered question that
  requires a partner answer and owes no outstanding reply or action. Courtesy
  closings ("Let me know if you need anything"), FYIs, completion confirmations,
  and a partner action/promise alone do not qualify. A specific confirmation
  request can qualify without a question mark.
- No follow-up needed: closure is suggested, never automatic.
- Needs my judgment: sensitive, ambiguous, or insufficient evidence.

Use **Your decision**, optionally explain why, then **Save changes** to correct
or approve the recommendation. No follow-up needed moves to Handled and clears
the follow-up date; Waiting moves to Waiting; Action only moves to Action needed;
Judgment remains under Needs your input. Notes and drafts are retained. Corrections are stored atomically
with the queue update and kept as partner-specific examples, NOT new standing
rules. Only explicit approval in the rule editor can broaden a preference into a global rule.
Your correction takes precedence for that message; a new email requires a fresh
assessment. Reassess manually when linked tasks change without a new email.

Action needed is a derived view of the existing `needs_input` storage status,
not a new database status. No SQL migration or bulk reassessment is needed to
separate existing current decisions. All open and Critical now still include
these items; bulk scope counts include them exactly once. Filtering and counts
use all routing metadata before pagination, not just the first 50 rows. A current
human correction overrides Leo; stale decisions never classify a newer message.
No task is created or completed automatically. Check Work for existing tasks
or use Add task in Mail, and change to Reply needed if an acknowledgment or completion email
is owed. Evaluate classification quality by missed requests and incorrect routes,
not just a smaller Needs your input count.

Offline routing regression: `node scripts/check-response-lanes.mjs`. It covers
human overrides, confidence, stale messages, pagination beyond 50, accurate lane
counts, legacy setup, and preservation of All open/Critical visibility.

After an outgoing reply, a high-confidence Waiting assessment can move the item
to Waiting only with a question quoted from Jaime's authored text (not quoted
email history). High-confidence Action only appears in Action needed. Other
outcomes remain Needs your input for approval; Leo never
automatically closes them. Existing saved human decisions are preserved. The
five-minute worker assesses a bounded backlog, so this is not an immediate
send-time guarantee. No new SQL is required; question evidence is stored in the
existing assessment JSON. For one legacy Waiting entry, use Check reply status,
then Assess response needs. For many, use the bulk review below.

### Bulk reassess conversations

In Attention's Partner responses section, open **Reassess conversations**, choose
a scope, then **Start new reassessment**. **All open** is the default: Needs
response, Draft ready, Needs your input, and Waiting. **Waiting only** is useful
for targeted cleanup. **All conversations, including Handled** is explicitly
opt-in; Handled is excluded from the other two scopes. The scope is locked while
a batch is running or paused so Resume cannot broaden its snapshot.

This deliberately uses Claude for every snapshot
entry, even when it has a previous assessment. No automatic migration or cron
starts a bulk run. The snapshot covers all pages in the selected scope (including tracked
archived conversations), not just the visible 50, with a 2,000-item safety cap.

- Keep the page open. One conversation is processed per request. Stop finishes
  the current request; Resume continues the remaining snapshot. Errors are
  listed per item without retrying automatically or overwriting newer edits.
- Leo reads the latest full available thread and current rules. Invalid or
  incomplete evidence cannot silently become closure. An assessment failure
  leaves that saved item unchanged; concurrent versions/new messages require
  a fresh review. No drafts are generated or retired by this action.
- Current recorded human response decisions remain unchanged and are flagged
  for individual review, even if Leo disagrees. New partner messages invalidate
  decisions on older messages. Direct manual Waiting selections now also record
  a correction. Older status-only selections have no provenance and cannot
  reliably be distinguished from the former automatic Waiting default.
  Included Handled items remain closed even without a recorded correction;
  only genuinely new incoming mail can reopen them, as in normal mail sync.
  Conflicting suggestions are flagged for individual review, not bulk override.
- High-confidence unresolved questions can stay Waiting. Other suggestions
  move unprotected items to Needs your input, or Needs response for a new
  incoming request. A current Draft ready item remains ready when the latest
  assessment still supports replying. Notes, draft text, and follow-up dates
  are preserved; a draft for an older message is never treated as current.
- Select likely resolved results and choose **Approve selected as no follow-up
  needed**, then **Confirm selected closures**. Each closure rechecks the queue
  version, batch assessment, absence of a current human decision, and latest
  Gmail message before moving it to Handled and clearing its follow-up date.
  New email can still arrive after the Gmail read; normal sync reopens it.
  No email is sent/archived and no task or TEMU data is changed.
- Assessments persist in the existing JSON column; no new SQL is needed. The
  batch progress/results list is browser memory only and is lost on refresh.
  Saved suggestions remain visible in Attention for individual review. A new
  run starts from the newly selected scope, not the old results list.

Run `node scripts/check-response-reassessment.mjs` for offline service, routing,
approval, pagination, and UI stop/resume checks. No live model/email/DB writes
are used. Actual assessment quality still requires human review.

Automatic drafts now require a high-confidence Reply needed assessment or your
explicit Reply needed correction, followed by the existing source/safety checks.
They still run only in the four preparation windows. Messages assessed after a
window's snapshot may wait until the next window; manual drafting remains
available after assessment/confirmation. No-reply suggestions stay visible for
approval, and an unresolved commitment is not erased by a later thank-you.

## Approved email-type rules and partner exceptions

Run `partner-response-rules.sql` **after `partner-response-policy.sql`** in Leo's
Supabase, then deploy. No new environment variables are needed. Without this
optional migration, existing corrections and assessments keep working; the rule
editor displays setup guidance. The migration does not approve any rules.

In an Attention conversation, save any edits, then open **Email-type rules &
partner exceptions**. Choose the email type, **All partners** or the current
partner, a default decision, and conditions/exceptions. **Review rule** only
previews the proposal; **Approve for…** saves it. Switching to All partners resets
the conditions to a generic template to avoid carrying over private details.
Do not put partner-specific information in global rules.

Templates cover meeting acceptances, new calendar invitations, declined/changed
meetings, acknowledgments, platform access, and curriculum questions. A simple
acceptance can suggest no reply; an invitation may require an RSVP without an
email reply. Questions and unresolved commitments still need attention.

An active partner exception replaces the general rule for that same email type.
Other partners' exceptions never enter the assessment context. Rules are matched
by the model against the full conversation, not blindly applied from a subject
line. Current Jaime direction and unresolved requests take precedence; ambiguity
requires judgment. Ordinary corrections remain examples, not automatically
approved rules. Rules cannot send emails, RSVP, create tasks, or close threads.

Use **Edit rule**, **Disable**, or **Review to re-enable** to maintain guidance.
Disabling a partner exception falls back to the active general rule, if any.
Concurrent changes require a fresh review. Rule IDs/versions considered are saved
with assessments, not claimed as proof that a rule was applied. Approval affects
future assessments only; use **Assess response needs** to reassess an existing
thread. A saved human decision for the same message still takes precedence.

Run `node scripts/check-response-rules.mjs` and
`node scripts/check-response-policy.mjs` for offline safety/regression checks.
These verify routing and model inputs, not Claude's real-world classification
accuracy. After deployment, test one plain acceptance and one acceptance with a
question, reviewing Leo's recommendation without sending anything.

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
the same message. New arrivals can be reconsidered. Confirmed-sent drafts move
to history; unsent drafts are never automatically replaced. Use **Prepare a fresh draft** yourself for unsent work. Set
`LEO_AUTO_DRAFTS_ENABLED=false` and redeploy to disable background preparation
without deleting saved work.

Existing urgent Slack alerts and morning/evening briefs remain in place. This
phase does not send four additional Slack notifications per day.

## Behavior and limits

- The classification cron checks every 5 minutes and follows Gmail history
  changes, including sent replies, labels, and deletions. Granola remains on its
  separate 15-minute schedule; draft windows and brief schedules are unchanged.
  Opening Today/Attention reads saved data; it does not trigger Gmail sync.
- The cursor advances only after a successful page. A database lease prevents
  overlapping checks. Interrupted work is replayed safely. An expired Gmail
  cursor triggers a full inbox listing plus every tracked thread, then resumable
  50-thread recovery batches; completion is not reported while batches remain.
- Partner matches use TEMU contacts/organization domains. Ambiguous threads
  require review; Leo never creates partners. Use Mail's existing TEMU review
  flow to confirm a partner. This queue does not write to TEMU.
- Reading a message does not resolve it. Use No follow-up needed or mark it Handled
  yourself. A new partner message reopens it; an outgoing reply moves open work
  to Needs your input for assessment but leaves Handled work closed. New arrivals retain
  unsent earlier drafts but flag them as outdated; confirmed-sent drafts move to
  Previous drafts. Updates use version checks to avoid
  overwriting another tab's edits. Manual changes require **Save changes** or
  **Save draft**; there is no autosave.
- Drafts are stored in Leo, not Gmail Drafts. Replaced and confirmed-sent drafts are retained in
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
node scripts/check-response-policy.mjs
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
4. Set a follow-up date, then use No follow-up needed. Confirm the date clears,
   notes/drafts remain in Handled recently, and read/label changes do not reopen it.
5. After a genuine new reply, check mail: it should reopen. A confirmed-sent draft
   belongs in Previous drafts; unsent text stays visible and marked outdated.
   Do not send test mail to a partner just to test.
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
