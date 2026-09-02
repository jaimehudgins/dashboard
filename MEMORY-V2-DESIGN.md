# Leo Memory v2 — Design Proposal

## Objective

Leo should retrieve the relevant, current version of what Jaime knows, show where it came from, distinguish fact from inference, and recognize when information may be stale.

Memory is not a transcript archive and should not attempt to place everything into an AI prompt. Source systems remain authoritative; Leo maintains a structured, searchable model over them.

## Design principles

- Every memory has a source or is explicitly marked as Jaime-provided.
- Facts, interpretations, commitments, and raw interactions are different records.
- New information supersedes old information without erasing history.
- Temporary information expires or becomes reviewable.
- Inferences carry confidence and never silently become verified facts.
- Retrieval is scoped to the person, partner, lesson, project, or decision at hand.
- Store the minimum sensitive content needed; link to source material when possible.
- External communication and consequential mutations always require approval.

## Three layers

### 1. Source events

Immutable records of what happened: an email, meeting, Slack message, Google Chat message, feedback row, repository report, schedule import, or direct statement from Jaime.

Suggested fields:

- `id`
- `source_type` — Gmail, Granola, Slack, Google Chat, CRM, GitHub, curriculum feedback, schedule CSV, or Jaime
- `external_id` — stable identifier in the source system
- `external_url`
- `occurred_at`, `ingested_at`
- `actor_entity_id`
- `summary` — minimal normalized content
- `content_hash` — prevents duplicate ingestion
- `sensitivity`
- `metadata JSONB`

### 2. Structured knowledge

Current, queryable knowledge derived from source events.

#### Entities and aliases

People, partner organizations, projects, lessons, units, initiatives, and decisions. Aliases connect identities across systems; email is the primary partner-person key.

#### Facts

Examples: a person's role, a partner's implementation date, a communication preference, or a lesson's planned use date.

Suggested fields:

- `entity_id`, `predicate`, `value JSONB`
- `status` — proposed, verified, inferred, disputed, or superseded
- `confidence`
- `valid_from`, `valid_until`, `expires_at`
- `source_event_id`
- `supersedes_fact_id`
- `created_at`, `updated_at`

#### Commitments

Owner, action, partner/project, due date, status, confidence, source, and completion evidence. High-confidence private commitments may be captured automatically; ambiguous ownership or meaning requires review.

#### Signals

Time-sensitive observations such as unanswered contact, low usage, lesson friction, positive implementation evidence, or relationship risk. Signals decay and should not masquerade as durable facts.

#### Decisions

Decision, rationale, owner, date, alternatives, affected entities, source, and review trigger.

### 3. Working context

A retrieval service assembles only what the current job needs:

- Current verified facts and clearly labeled inferences.
- Recent meaningful interactions.
- Open commitments and unresolved signals.
- Relevant decisions and work state.
- Direct source links.

Examples include a partner-response packet, meeting-preparation packet, or curriculum work package.

## Ingestion and updates

| Source | Initial cadence | Memory produced |
|---|---:|---|
| Gmail | Continuous/cron | Interactions, requests, commitments, sentiment signals |
| Granola | Existing two-hour sync | Meetings, commitments, partner and curriculum evidence |
| CRM | On retrieval plus scheduled reconciliation | Partner identity, health, contact history, open follow-ups |
| Slack | Later continuous sync | Internal commitments, decisions, partner and curriculum context |
| Google Chat | Later continuous sync | Partner interactions, requests, commitments |
| GitHub/repository | Commit or scheduled scan | Lesson version, reports, pipeline state, decisions |
| School schedule CSV | Each download/import | Expected lesson-use dates |
| Curriculum-feedback CSV | Weekly import | Ratings, observations, curriculum signals |
| Jaime | Immediate | Corrections, preferences, decisions, explicit facts |

Ingestion should be idempotent. Reprocessing the same source must not create duplicate memories.

## Freshness and reconciliation

1. Resolve referenced entities using stable IDs and aliases.
2. Create the source event.
3. Extract candidate facts, commitments, and signals.
4. Automatically accept safe, high-confidence private records; queue ambiguity.
5. Compare candidate facts with current facts.
6. Supersede older facts when a newer authoritative source is clear.
7. Queue contradictions or sensitive changes for Jaime.
8. Expire temporary signals and prompt review of important stale knowledge.

Suggested initial freshness rules:

- Active issue or relationship signal: review/expire after 14–30 days.
- Implementation dates and current roles: review when contradicted or after 90–180 days.
- Communication preferences: durable, but editable and source-visible.
- Commitments: current until completed, canceled, or superseded.
- Curriculum quality findings: tied to a repository revision; stale when the lesson changes.
- School schedule dates: tied to an import version; superseded by the next import.

## User controls

Every displayed memory should offer:

- **Correct** — provide the current fact.
- **Outdated** — retain history but remove it from current context.
- **Not relevant** — lower retrieval importance.
- **Sensitive** — restrict or remove stored content.
- **Why do you know this?** — show sources and derivation.

A weekly digest should show important additions, changes, contradictions, and expiring knowledge. Jaime's corrections become high-authority source events rather than silent edits.

## Security requirements

The current `memory` table allows anonymous-key access and relies on the app's authentication gate. Do not place richer organizational or personal memory behind that policy.

Before Memory v2 stores sensitive context:

- Move memory reads and writes behind authenticated server routes.
- Apply user-scoped row-level security and deny anonymous direct access.
- Separate public browser configuration from privileged server credentials.
- Minimize copied message/transcript content and retain source links.
- Assign sensitivity levels and exclude restricted content from general retrieval.
- Maintain an audit trail for creation, correction, supersession, and deletion.
- Define retention and deletion behavior for partner and student-related information.

## Migration from the current table

Use a reversible transition:

1. Leave the existing `memory` table intact.
2. Add Memory v2 tables through reviewed migrations.
3. Backfill existing rows as sourced facts with `legacy_memory` provenance.
4. Dual-read during the pilot.
5. Move chat and attention retrieval to Memory v2 after verification.
6. Retire the legacy path only after accuracy, security, and retrieval tests pass.

No database changes are applied by this proposal.

## Initial vertical slice

Start with Gmail and Granola:

1. Resolve people and partners primarily by email.
2. Record meaningful interactions as source events.
3. Extract private commitments and partner signals.
4. Display current context and sources on Attention cards.
5. Add correction controls and a weekly memory digest.
6. Measure extraction accuracy, corrections, stale-memory incidents, and time saved.

Add Slack, Google Chat, curriculum sources, and platform support snapshots only after this loop proves trustworthy.
