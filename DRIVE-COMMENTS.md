# Drive comments pilot

Attention now has a separate Drive comments section. Connect an individual file,
read comments and replies, mark **Needs response** / **No action needed**, create
one linked Work task per comment, or explicitly confirm a reply/resolution in Drive.
No action needed is local only. Tasks and comment resolution are independent.
New comment activity returns a previous decision to Review on the next refresh.

## Setup (Leo, not TEMU)

1. Run [`drive-comments.sql`](./drive-comments.sql) in **Leo's Supabase**.
   The existing server-only `SUPABASE_SERVICE_ROLE_KEY` is required. No browser
   access is granted to these tables. This migration changes no Google files.
2. In the **same Google Cloud project as Leo's existing Google OAuth client**,
   enable **Google Drive API** and **Google Picker API**.
3. In Google Auth Platform → Data Access (OAuth consent scopes), add
   `https://www.googleapis.com/auth/drive.file`. Keep the existing scopes,
   including `drive.readonly`. Do not replace them with full `drive` access.
   `drive.file` can modify selected files, not just their comments; Leo exposes
   only confirmed comment reply/resolve operations and no file-content writes.
4. Create a browser API key in that project. Restrict it to **Google Picker API**
   and **Google Drive API**, and restrict websites to:
   - `https://strategic-dashboard-sooty.vercel.app/*`
   - `https://docs.google.com/*` (Picker's iframe)
   - Add local or preview origins only if you will test those environments.
   Ensure Leo's production origin is in the existing OAuth client's authorized
   JavaScript origins. Preserve its existing NextAuth redirect URI.
5. Add to **Leo's Vercel Production environment**:
   - `GOOGLE_DRIVE_COMMENTS_ENABLED=true`
   - `GOOGLE_PICKER_API_KEY=<the restricted API key>`
   - `GOOGLE_CLOUD_PROJECT_NUMBER=<numeric project number, not project ID>`
   The API key and project number are intentionally returned to the authenticated
   browser for Picker; they are not Supabase/server secrets. Never paste OAuth
   client secrets or service-role keys into these fields.
6. Deploy the code, sign out/in to Leo (or use **Reconnect Google**), accept
   selected-file permission, then use Attention → Drive comments →
   **Choose with Google Picker** to select the test spreadsheet. A pasted file
   link allows reading but does not itself grant selected-file write permission.
   Reconnecting Codex's Google connector does not reconnect Leo.

Official setup: [Google Picker sample and prerequisites](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample).
Permission model: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Safe acceptance test

Use only the disposable comment “Leo integration test — safe to reply to and
resolve.” Existing comments must remain untouched.

1. Connect **Willow Curriculum (All Grades + Units)** and refresh. Check the
   test comment, quoted text, author, and replies match Drive.
2. Mark the test comment **No action needed**. It leaves Open but remains under
   No action needed / All. Confirm it is still unresolved in Drive.
3. Return it to Review, create a clearly labeled test task, and verify the file
   link and comment details in Work. Repeated creation must open the existing
   task, including after completion, rather than create a duplicate.
4. Reply to the test comment: enter text → Review reply → Confirm and post.
   Check exactly one reply in Drive. No email/TEMU write should occur.
5. Make a new reply/edit in Drive and refresh Leo. It must return to Review.
   If an editor was open, its old revision must be rejected without losing text.
6. Confirm **Resolve in Drive**, refresh, and check All / resolved. The Work
   task should remain unchanged. Complete the test task separately if desired.

If Google returns an uncertain write outcome (timeout/5xx/lost receipt), Leo
retains a durable claim and never retries automatically. Check Drive and refresh.
If no write occurred and the same-version claim remains, an operator must inspect
the matching `leo_comment_writes` record and remove only that verified failed
claim before retrying. Do not bulk-clear the table.

## Current boundaries

- Pilot is **manual refresh, one selected file at a time**, not an automatic
  inbox-wide comment scan. No folder recursion or email-notification suppression.
  Email notifications remain available until direct retrieval is proven reliable.
- Uses Leo's signed-in Google token; no background token or unattended writes.
- Quoted text is displayed safely; opaque Drive anchors are not guessed as cell
  addresses. Open file links navigate to the file, with comment ID in task details.
- Read failures are not empty queues. Resolved comments remain accessible in All.
- Before each action Leo checks the current comment revision. Google does not
  provide an atomic transaction with Leo's database: another edit can still occur
  in the short interval between that check and Google's write.
- No AI drafting/classification for comments yet; these are explicit user decisions.

Verification: `node scripts/check-drive-comments.mjs`,
`node scripts/check-drive-comments-ui.mjs`, targeted ESLint, `npx tsc --noEmit`,
and `npm run build`. Tests use synthetic data and make no external writes.
