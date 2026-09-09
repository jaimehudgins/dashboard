# Email handling calibration — September 8, 2026

Confirmed by Jaime in this conversation (not inferred from synthetic examples):

1. When requested ALMA reviewer names arrive, propose enriching the existing open
   platform task. Do not draft an acknowledgment unless another question needs an
   answer. Jaime performs the platform change.
2. If **any part** of a request is unanswered, keep the conversation open and
   explicitly identify each outstanding part for Jaime. A thank-you or partial
   answer must not conceal remaining work. Prepare supported missing answers;
   flag missing information instead of inventing it.
3. For urgent platform/access issues, flag Jaime's action, prepare a review-only
   acknowledgment, and send an urgent Slack alert without waiting for the draft
   or scheduled briefing. Do not claim a fix or promise a completion time.

## Completion follow-up — recommendation, not yet approved

After Jaime explicitly verifies the relevant partner-facing task is complete,
propose a short completion email for approval (for example, “Ana and Ben now have
reviewer access”). Never infer completion from a generated draft or a promise.
Do not send automatically. Combine related completions into one useful update,
avoid duplicate notices, and retain any other unresolved request in the thread.
Do not send completion notes for internal housekeeping with no partner impact.

Jaime asked whether this should happen; the recommendation above is not a new
permission to send emails or an implemented task-completion trigger.

## Delivery timing and verification boundary

The local mail cron is scheduled every five minutes. It sends urgent alerts after
mail sync and before deeper response assessment, independently of the four reply
preparation windows. “Immediate” means **on detection**, not guaranteed at receipt:
normally the next check plus processing time, assuming sync/classification succeeds,
Slack is configured, and the scheduler is healthy. More than eight pending urgent
items, service errors, or retries can add delay. Production delivery is not verified
by an offline test.

The eval now requires S02's review-only acknowledgment and explicit identification
of S07's outstanding Spanish family sheet. The alert-path test exercises the actual
cron/sender code with fake Gmail, storage, and Slack transports; it does not measure
the urgency classifier's accuracy. All other review-case policies remain proposed
unless covered by the three confirmed rules above. The frozen B0 is unchanged.
