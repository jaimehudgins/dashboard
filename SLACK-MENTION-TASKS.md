# Tasks from Slack mentions

In a channel where Leo has been invited, **reply in the relevant message thread**:

> @Leo create a task for me to add Alex and Sam as ALMA flag reviewers.

Leo reads that thread through your mention, creates one pending task in Work,
and sends a private DM confirmation. The task includes a Slack permalink and
supporting text. No channel reply is posted, even when Slack alerts use a shared
channel. Only the configured `SLACK_ALERT_USER_ID` can trigger this workflow.
Other participants supply context, not instructions or permission to act.

For ambiguous requests, several unclear actions, or incomplete/inaccessible
context, Leo asks you privately for clarification without creating a task.
Clarify with a **new @Leo mention in the original thread**; replying “yes” in a
DM does not resume a pending mention proposal. You can instead DM Leo a complete
standalone task request using the existing DM workflow.

## Enable

1. Run [leo-slack-mentions.sql](leo-slack-mentions.sql) in **Leo's Supabase**.
   It creates a private request/deduplication table; it creates no tasks. This
   path uses the existing server-only `SUPABASE_SERVICE_ROLE_KEY` and primary
   Supabase URL, never the CRM service key.
2. In the existing Leo Slack app, add the **bot event `app_mention`** under Event
   Subscriptions. Keep `message.im` and the existing `/api/slack/events` request
   URL. The existing signing secret still verifies requests.
3. Under OAuth & Permissions, add bot scopes **`app_mentions:read`** and
   **`channels:history`**; add **`groups:history`** if using private channels.
   Keep existing `chat:write`, `im:write`, and DM scopes. Reinstall the app to
   authorize changed scopes. If Slack issues a new Bot User OAuth Token, update
   `SLACK_BOT_TOKEN` in Vercel; never put it in chat or source control.
4. Invite Leo to each channel where you want to use it. There is no auto-join or
   general channel monitoring. This workflow is for public/private **channel
   threads**, not mentions inside DMs between other people.
5. Deploy Leo, then open its Slack page. “Mention-task storage is ready” verifies
   database setup only—not Slack scopes, subscriptions, or membership. That
   page also shows the latest processing/delivery error.

Slack references: [app_mention events](https://docs.slack.dev/reference/events/app_mention/),
[thread retrieval and scopes](https://docs.slack.dev/reference/methods/conversations.replies/).

## Boundaries and recovery

- Reads only the requested thread, not adjacent channel messages or unrelated
  Slack history. A top-level mention has no preceding conversation context;
  provide a complete task there or reply in the source thread.
- Reads at most three pages, 100 messages, and 30,000 characters. It stops with
  a private explanation if the complete thread through the mention is missing
  or over those limits; it never silently substitutes a truncated thread.
  Attachments and linked documents are not fetched.
- A dedicated structured extractor has **no tools**. Server code can insert
  one task only. Task source, ID, pending status, and project-free destination
  are server-controlled. No email, CRM, platform, calendar, task-completion,
  or Workbench execution is performed. Due dates require evidence; uncertain
  work area stays unassigned.
- Slack retries are deduplicated by channel/message and event ID. Task IDs are
  deterministic for that mention; inserts cannot overwrite existing work.
  Separate new mentions are separate requests, so inspect Work before repeating
  one if the acknowledgement is missing. There is no semantic duplicate merger.
- Failed or interrupted requests are not automatically replayed. A task may
  have been saved before a response was lost. Check Work and Leo's Slack status;
  do not interpret silence as proof that nothing was created. Private delivery
  failure is recorded without deleting the task or retrying task creation.
- DMs, urgent alerts, and scheduled briefings keep their existing behavior.

## Verify

Run `node scripts/check-slack-mentions.mjs` for offline routing, authorization,
pagination, deduplication, task-save, and failure checks. Transports/model results
are synthetic: this does not measure Claude's actual extraction quality.

After setup, deliberately create one disposable test task: post a concrete
request in a test channel, reply to it with `@Leo create a task for me from this`,
and confirm the private acknowledgement and task source link in Work. Review
the title, description, due date, and area. A generic `@Leo what do you think?`
should ask for a task request and create nothing. Mentions by other people
should be ignored. Do not use real platform changes or partner emails as tests.
