# Leo–TEMU partner context ownership

Leo is Jaime's operating surface. TEMU CRM is the shared institutional record.
Leo reads TEMU live and does not duplicate editable copies of CRM-owned fields.

## Field ownership

| Information | Owner | Leo behavior |
| --- | --- | --- |
| Partner identity, contacts, status, priority, health, renewal, implementation stage | TEMU | Read live; propose changes for approval |
| Touchpoints, important dates, shared follow-ups | TEMU | Read live; export only after explicit approval |
| Meeting record and transcript | Granola | Read relevant recent meetings; route approved summaries or commitments to TEMU |
| Email history | Gmail | Retrieve only partner- and topic-relevant messages |
| Canonical plans, agreements, resources, and deliverables | Google Drive | Search when the request concerns implementation, commitments, schedules, or documents |
| Personal priorities, drafts, research packets, tentative interpretations | Leo | Keep private; never export automatically |
| Durable partner preferences and context | Leo memory | Store with source, date, importance, and optional expiration |

## Freshness and conflict rules

1. Current TEMU fields are authoritative for partner state.
2. Recent explicit meeting or touchpoint commitments outrank older notes.
3. Current canonical Drive documents outrank informal historical references.
4. Verified platform guidance governs product navigation and how-to answers.
5. Leo memory may add nuance but never silently override a current source.
6. Older emails are supporting history, not canonical state.

Conflicts must be shown as needing verification. A fact without a source is not
safe for a partner-facing draft.

## Export policy

Start read-heavy and write-light. Approved export types are:

- Partner follow-up task
- Touchpoint or sent-email record
- Confirmed meeting commitment
- Confirmed implementation milestone

Partner status, relationship health, renewal state, and contact changes always
require an explicit preview and approval. Drafts, AI reasoning, confidence
scores, and tentative memory never leave Leo.

New write routes must use a server-only, least-privilege TEMU credential and an
idempotency record. Do not expand the browser-exposed anonymous CRM client for
new writes.
