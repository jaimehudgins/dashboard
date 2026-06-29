# Leo: The Build Plan

A working roadmap for evolving the strategic dashboard into Leo, your Chief of Staff.
Owner: Jaime Hudgins. Last updated: June 2026.

---

## What this is

A phase-by-phase plan for turning the existing strategic dashboard into Leo: a full operating layer for the CAO role that handles tasks, calendar, email, meetings, partner attention, and chat. Built on the existing Next.js / Supabase / Vercel stack, extending the codebase you already have rather than starting fresh.

Total scope: roughly **5 to 7 months of focused part-time build**. Faster if a phase gets parallel attention from Ryan or another builder.

---

## The starting point

The strategic dashboard is already 70 to 80 percent of Leo. What's running today:

- Personal task management with projects, milestones, areas, tags
- Inbox capture, focus sessions, energy tracking, sticky notes, quick tasks
- SmartInsights (overdue, due-soon, stale, balance, momentum)
- DailySummary and WeeklyReview
- Curriculum tracker
- CRM bridge: read access to TEMU CRM (`crm-supabase.ts`) with realtime subscription
- Partner Tasks page that already pulls follow-up tasks and onboarding tasks from PMA

What needs to be added: Google auth, custom calendar UI, custom Gmail UI, Granola integration, MCP server, persistent chat memory, partner attention insights, morning brief, EOD debrief, and a handful of gap-fillers.

---

## Workflow gaps surfaced during this analysis

These aren't on the current build but would make Leo materially more useful. Each is mapped to a phase below.

1. **Voice quick capture** — a "speak to inbox" feature for moments when typing is friction (walking the dogs, between meetings, in the kitchen). Currently no voice input anywhere. *Phase 6c.*
2. **Decision log** — for a role built on placing bets, a structured place to record decisions, the reasoning, what happened. Currently nothing. *Phase 6b.*
3. **Writing / drafting surface (Sam)** — Bet 04 (public voice) needs a drafting space for posts, frameworks, ideas in flight. Named for Sam Seaborn, the chief speechwriter. Currently nothing. *Phase 6a.*
4. **Google Drive search (Mrs. L)** — you have hundreds of curriculum docs, AI Labs scoping, retreat materials. A search-across-Drive surface inside Leo would beat opening Drive every time. *Phase 6d.*
5. **Field Intelligence (CJ)** — your retreat doc names this as one of Leo's agents: ambient monitoring of CCR-relevant signal (research, funders, conferences, other programs, policy). Currently nothing structured. *Phase 6e.*
6. **The Writers' Room — Persona Bench** — from your retreat doc: teacher persona, student persona, skeptical board member, past-Jaime. A small surface for invoking each persona for friction before real people see your work. *Phase 6f.*
7. **Curriculum Feedback Loop** — ties partner usage data (CRM) to specific lessons (curriculum tracker) to give you "Unit 3 is landing well at LEAD but bombing at Memphis Charter" as a real signal. Bridges your two halves of the role directly. *Phase 6g.*
8. **Slack (Josh)** — Willow uses Slack heavily, and Leo missing it is a gap. Triage, AI layer, draft support, cross-reference with partner CRM. *Phase 6h.*
9. **Energy-aware scheduling** — energy_logs already exist; Leo could use them to recommend when to schedule hard meetings vs deep work. *Folded into Phase 2.*
10. **Travel and event prep** — already named in Leo's job description; needs a small surface for pre-trip briefings and packing. *Folded into Phase 2.*
11. **Public publishing tool** — for actually shipping Bet 04 content. Could be tied to Sam (Phase 6a) or stay external (LinkedIn, blog). *Out of scope for v1.*
12. **Curriculum repo wiring** — the curriculum half of Leo is currently a status tracker. Wiring in the GitHub repo (lesson content, agent pipeline, briefs, skills) lifts it to an operating surface: search, pipeline visibility, conversational edits. *Phase 6i.*

---

## Phase 0: Foundation (1-2 weeks)

The plumbing that makes everything else possible. No new features; just clearing the runway.

| Task | Notes |
|---|---|
| Rename project to Leo | package.json, README, sidebar branding, page titles. Vercel project rename optional. |
| Add NextAuth + Google OAuth | Port from PMA's `src/lib/auth.ts`. Request all scopes up front: Calendar, Gmail, Drive (even if Drive isn't used yet). |
| Add `memory` table to Supabase | For Phase 3, but cheap to add now. |
| Add `quotes` table + seed | Daily WW quote. Schema in earlier conversation. |
| Replace tasks page H1 with **What's next?** | Plus *"Nothing right now. Nice work."* empty state. |
| Set up Vercel cron for background jobs | Even if no jobs yet, the scaffolding lets later phases drop jobs in. |

**WW touches added:** *What's next?* on tasks. Daily quote on the brief (when Phase 1 lands).

---

## Phase 1: Daily Rhythm (2-3 weeks)

The morning and EOD surfaces that anchor every day. Most components already exist; this is mostly assembly.

| Build | Source / mechanism |
|---|---|
| `/brief` page | Pulls: today's tasks (DB + CRM follow-ups + CRM onboarding), today's calendar (placeholder until Phase 2), top SmartInsights, top 3 partners needing attention, momentum line. |
| `/eod` page | Pulls: completed today, focus minutes, project breakdown, tomorrow preview, top 3 open loops. |
| Daily WW quote at top of `/brief` | Deterministic-per-date selection from `quotes` table. |
| CRM-aware insights | Extend SmartInsights with: `partner_silent` (last_contact > 30 days), `renewal_window` (renewal date within 90 days), `proposal_pending` (proposal_deadline approaching), `health_declined` (relationship_health moved to Watch or worse). Read additional CRM fields: `touchpoints`, `important_dates`, `relationship_health`, `renewal_status`, `last_contact_date`, `next_follow_up`. |
| Rebrand WeeklyReview to **Big Block of Cheese Day** | Header text change plus a small intro paragraph framing it as the space for the unconventional thinking that gets pushed off in normal weeks. |
| Energy-aware nudges | When energy log shows low recent energy, brief surface recommends lighter work for the day. |

**WW touches added:** *Big Block of Cheese Day* on weekly review. Morning brief opens with *What does the day look like?* as a small subtitle. Daily quote.

---

## Phase 2: Charlie — Calendar (3-4 weeks)

Custom full-CRUD calendar UI in Leo. Google Calendar stays as the source of truth and as your mobile fallback.

**Naming convention:** the calendar agent is **Charlie** (Charlie Young managed President Bartlet's schedule). Where Leo's UI says "agent" or shows a status, Charlie carries it.

| Build | Notes |
|---|---|
| Port `google-calendar.ts` from PMA | Read events. |
| `/calendar` page with day/week/month views | Standard calendar UI. Use a library like FullCalendar or build from scratch with date-fns. |
| Event CRUD (create, edit, delete) | Including recurring patterns, exception handling. |
| Attendees, RSVPs, Meet conferencing links | Google Meet auto-generated. |
| Multi-calendar support | Personal + Willow, color-coded. List from Calendar API. |
| Free/busy queries | Powers "find a time" feature. |
| "Find me 30 minutes" natural language scheduling | Claude API call with calendar context. |
| Energy-aware scheduling hints | When booking a 90-min deep-work block, prefer high-energy historical times. |
| Travel prep surface | Small `/travel` page or section: upcoming trips, packing checklist, briefings for partners in the destination city. |

**Decision point during Phase 2:** Do you want Leo to ever auto-decline meetings based on rules (e.g., decline external calls on Tuesday invention day)? If yes, requires confirmation flow.

**WW touches added:** Charlie as the calendar agent name. "Find me a time" feature could use Charlie's framing: *"Charlie, when can I take a 30-minute call with Sarah next week?"*

---

## Phase 3: Tools + MCP — chat lives elsewhere (1-2 weeks)

Build Leo's tool surface and expose it via MCP. You connect Claude.ai to it and have working chat *today*. No new chat UI yet.

| Build | Notes |
|---|---|
| Tool definitions for everything Leo can read or do | Tasks: list, search, create, update, complete. Calendar: list events, find free time, create event, edit. Gmail: list inbox, get thread, search (drafting comes in Phase 4). CRM: get partner, list partners, search touchpoints, create follow-up task. Curriculum: list lessons, get unit. |
| MCP server (Node, separate dir) | Exposes the tool surface. Authenticates against your Supabase + Google. Hosted on Vercel or Railway. |
| Connect MCP server to Claude.ai | Settings → Connectors. Test conversational queries. |
| `memory` table populated by chat | Persistent structured memory: entity (partner_id, project_id, etc.), fact, source conversation, timestamp. |
| Memory injection on new chats | When chat opens about partner X, load relevant memory entries as system context. |
| Confirmation flow for write operations | Leo proposes the email/task/calendar change. Approval required before execution. |

**WW touches added:** When you start a chat in Claude.ai using the MCP server, Leo introduces itself with a quiet *"Mr. President"* or *"What can I do for you?"* style. Subtle.

---

## Phase 4: Donna — Email (4-6 weeks)

Custom Gmail client in Leo: receive, triage, draft, send.

**Naming convention:** the email assistant is **Donna** (Donna Moss handled Josh Lyman's comms).

| Build | Notes |
|---|---|
| Gmail API integration | Reuse the OAuth from Phase 0. Scopes: read, modify, send, drafts. |
| `gmail_threads_cache` table | Cache thread metadata for fast UI. Don't cache full bodies. |
| `/mail` inbox view | Conversation threading. Three buckets visible: Action Needed, FYI, Can Wait. |
| Triage classifier | Claude API call when new message arrives. Categorizes into the three buckets. Result stored in `gmail_classifications`. |
| Read view | Threaded conversation. Attachment handling. Calendar invite handling (one-click accept routes to Charlie). |
| Compose view | Reply, reply-all, forward, new. Rich text editor. |
| **Voice training corpus for drafts** | Pull 30 to 50 sent emails covering: partner reply, internal Willow comms, scheduling, declining, follow-up, sales outreach, problem-solving. Store as `email_voice_samples`. |
| Context-aware draft generator | When drafting reply: load thread context, sender's CRM data if a partner, recent touchpoints, open follow-ups, any Granola transcripts mentioning the sender. Few-shot with voice samples. |
| Send, save draft, schedule send | Standard. Confirmation required for first 100 sends; can opt out after. |
| Labels, archive, snooze, delete | Standard Gmail operations. |
| Search | Gmail API search, plus cached metadata for fast filter. |

**Decision points during Phase 4:**
- Send-without-confirmation after how many successful sends? Default: 100. You can adjust.
- Schedule-send default for late-night drafting (e.g., draft at 11pm, send at 7am)? Default: yes.
- Notification model: do you want push notifications for Action Needed, or only inside Leo?

**WW touches added:** Donna as the email assistant name. Triage states could lean on the show's voice: Action Needed might say *"I think you'll want to see this"* in micro-copy. FYI = *"For when you have a minute."* Can Wait = *"This one isn't urgent."*

---

## Phase 5: Margaret — Meetings (2-3 weeks)

Granola integration: transcripts in, tasks out.

**Naming convention:** the meeting-notes layer is **Margaret** (Margaret was Leo's assistant who took his notes).

| Build | Notes |
|---|---|
| Granola API integration | Polling job on Vercel cron. Every few hours, pull new notes via `public-api.granola.ai/v1/notes`. |
| `granola_meetings` table | Cached meeting metadata. |
| `granola_transcripts` table | Full transcript content cached locally. |
| `granola_extracted_tasks` table | Tasks extracted from transcripts. |
| Task extraction pipeline | For each new transcript, Claude API call: "Extract any tasks or commitments Jaime made. Return JSON: {task, due_date_if_mentioned, partner_id_if_attendee_match, source_quote}." |
| Partner-attendee matching | Match Granola attendee names against PMA contacts. When matched, link extracted task to the partner. |
| Smart task routing | Partner-linked task → PMA `follow_up_tasks` (team-visible). Personal task → strategic dashboard `tasks`. |
| `/meetings` page | Lists recent Granola meetings, their summaries, extracted tasks, links to transcripts. |
| Transcript search | Tool available in MCP and in `/meetings` UI. |
| Integration with chat | "Leo, what did Sarah say about her budget concerns?" → search transcripts → return relevant excerpts. |

**Decision point during Phase 5:**
- Auto-create extracted tasks, or require confirmation? Default: confirmation for first 30 days, then auto with notification.
- Granola summaries shown in partner pages? Yes, with a "from your meeting on X date" link.

**WW touches added:** Margaret as the meetings-notes agent. The `/meetings` page header could be *"Tell me what you know."*

---

## Phase 6: Worth Adding (2-4 weeks)

The gap-fillers. None individually huge; together they fill out what Leo *should* be for a role like yours.

### 6a. Sam — Writing surface (1 week)

For Bet 04 (public voice). A drafting space inside Leo for posts, frameworks, half-formed thinking.

**Naming convention:** **Sam** (Sam Seaborn, chief speechwriter).

| Build | Notes |
|---|---|
| `writing_drafts` table | Title, content (markdown), status (in_progress, ready_to_publish, published, archived), audience (LinkedIn, blog, internal, conference talk), tags. |
| `/sam` or `/writing` page | List of drafts, filter by status, full-page editor. |
| Draft-with-context | When drafting, optional: load relevant CRM/curriculum/Granola context to ground the writing. |
| Voice consistency check | Compare draft against your past published work for voice drift. |

### 6b. Decision log (3-4 days)

For a role built on placing bets, a structured record of decisions made and why.

| Build | Notes |
|---|---|
| `decisions` table | Decision, context, options considered, choice, reasoning, expected outcome, actual outcome (filled in later), date, related entities. |
| `/decisions` page | List view, individual decision view, "decisions overdue for review." |
| Capture flow | Quick capture from chat: "Leo, log a decision: chose to defer the LEAD RFP rewrite to focus on Crash Course units. Reasoning: timeline conflict." |
| Review prompts | At weekly review, surface decisions made 30, 60, 90 days ago for retrospective. |

### 6c. Voice quick capture (3-4 days)

For moments when typing is friction. Walking the dogs, between meetings, in the kitchen.

| Build | Notes |
|---|---|
| Browser voice input on mobile Leo UI | Web Speech API or Whisper API for higher fidelity. |
| Routes to inbox_items | Same destination as text quick-capture. |
| Optional auto-categorization | Claude API: is this a task, note, decision, idea? Route accordingly. |

### 6d. Mrs. L — Drive search (1 week, optional)

A surface for searching across your Google Drive curriculum docs, AI Labs notes, retreat materials.

**Naming convention:** **Mrs. Landingham** (Mrs. L), who knew where everything was.

| Build | Notes |
|---|---|
| Google Drive API integration | Reuse Phase 0 OAuth (Drive scope). |
| Drive search tool | Exposed in MCP, available in chat. |
| `/drive` or `/mrsl` search page | List of recent docs, search by content. |
| Cross-reference with other Leo data | "Find the curriculum doc I was working on last Tuesday related to Unit 3." |

### 6e. CJ — Field Intelligence (1-2 weeks)

Ambient monitoring of CCR-relevant signal: research being published, what funders are saying, conferences, what other CCR programs are launching, policy and world changes that affect what you teach. From your retreat doc; not yet built.

**Naming convention:** **CJ Cregg** (Press Secretary, watched the news, did the briefings).

| Build | Notes |
|---|---|
| `field_signals` table | Source, title, summary, url, relevance_score, captured_at, tags. |
| Source registry | RSS feeds, newsletter subscriptions, journal alerts, conference programs, policy trackers. Configurable. |
| Daily ingestion job | Vercel cron pulls new items, runs Claude API for summary + relevance scoring. |
| Real-time alerts | When something scores high relevance against current decisions you're making, surface in brief. |
| `/cj` or `/field` page | Weekly digest view, full archive, search. |
| Feeds Sam (Phase 6a) | Research surfaces become drafting material. |
| Reading list / saved items | Sub-feature: save items for later, no auto-categorize. |

### 6f. The Writers' Room — Persona Bench (1 week)

From your retreat doc: a roster of voices that push back on your work before any real human sees it. Teacher persona, student persona, skeptical board member, past-Jaime. Mostly an AI capability (prompts + few-shot) rather than infrastructure, but deserves a surface.

| Build | Notes |
|---|---|
| `personas` table | Persona name, description, role context, voice characteristics, few-shot example exchanges. |
| `/writers-room` page | Pick a persona, paste or load draft work, get the persona's reaction. |
| Persona definitions | Teacher (Memphis charter, 3 years experience, teaches Algebra 2). Student (11th grade, considering trades). Board member (skeptical of new tech, wants outcome data). Past-Jaime (trained on your prior work and decisions). |
| Integration with Sam (6a) | "Send this draft to the writers' room" button. |
| Integration with curriculum tracker | "Send this lesson to the teacher persona" for backtesting. |

### 6g. Curriculum Feedback Loop (1-2 weeks)

Ties partner usage data (TEMU CRM) to specific lessons (curriculum tracker) so you can see "Unit 3 is landing well at LEAD but bombing at Memphis Charter Schools" as a real signal. Bridges curriculum and CS halves of your role directly.

| Build | Notes |
|---|---|
| Lesson-to-partner usage view | Per lesson: which partners' teachers are using it, completion rates, time spent, any captured feedback. |
| Per-partner curriculum signal | Per partner: which lessons their teachers run, which they skip, which generate feedback. |
| Teacher feedback capture | Either: scrape from platform if they comment, or a small "feedback captured" pipeline from PD sessions and partner calls (transcripts via Margaret). |
| New SmartInsights types | `lesson_landing_well` (high engagement at multiple partners), `lesson_struggling` (low engagement, negative feedback), `partner_curriculum_drift` (partner stopped using lessons in their plan). |
| Feeds Sam (6a) | "Write a piece about what's working in Unit 3 across partners" gets real data, not vibes. |

### 6h. Josh — Slack (2-3 weeks)

Slack integration for the Willow workspace. Different mechanics from email (more conversational, faster rhythm, internal coordination).

**Naming convention:** **Josh Lyman** (handled internal political coordination, which is Slack's role at Willow).

| Build | Notes |
|---|---|
| Slack app + OAuth | Workspace-bound Slack app for Willow. Scopes: channels:history, im:history, mpim:history, search:read, chat:write. |
| `slack_messages_cache` table | Cache message metadata for fast access. |
| `/slack` triage view | Three buckets: @mentions, DMs, channel noise. Action-needed surfaced. |
| Triage classifier | Claude API call on incoming messages. Same pattern as Donna. |
| Search across Slack history | Tool exposed in MCP. "What did Ryan say about the gradebook last week?" |
| Draft Slack messages with context | Same pattern as Donna's email drafts; pulls from CRM, curriculum, Granola. |
| Status awareness | Respect DND blocks. Don't push triage during deep work time. |
| Cross-reference | When a Slack message mentions a partner, surface CRM context. |

**Decision points during Phase 6h:**
- Read all channels, or only ones you're explicitly in? Default: only ones you're in.
- Auto-respond to anything? Default: no. Always draft, always confirm.
- Long threads: full digest or just unread? Default: digest with link to thread.

### 6i. Curriculum Repo Integration (1-2 weeks)

The curriculum half of Leo lifts from status tracker to operating surface. Single GitHub repo holds lesson content, the 11-agent pipeline files, briefs, milestone overviews, skills (classroom-ppt, willow-brand). Wiring it into Leo unlocks search, pipeline visibility, and conversational edits.

No agent name on this one. It's infrastructure, not a person. If you later build out an editorial-review function (voice and rigor pass before shipping), that could be Toby. For now: just "the curriculum wiring."

| Build | Notes |
|---|---|
| GitHub API integration | PAT for v1 (simpler, single user). OAuth flow optional later. Read access initially. |
| Repo indexing job | Vercel cron: pull recent commits, index lesson files, skills, agent instructions. Webhook for push-triggered updates. |
| `curriculum_files` table | Path, type (lesson / agent_instruction / skill / brief / milestone_overview), content excerpt, unit, grade, lesson number, status (drafting / in_qa / shipped), last_modified. |
| `/curriculum/search` page | Full-text search across lesson content. Filters: unit, grade, lesson number, status, file type. |
| Search tool in MCP | Exposes content search via MCP for Claude.ai. |
| Filesystem MCP server | Points at the local clone. Enables conversational edits in Claude Code-style flow. |
| Pipeline visibility | Read agent instruction files. Surface in Leo which agents are active, what's blocked, what's awaiting your review. Ties into curriculum tracker. |
| Cross-reference with Margaret | Partner call mentions Unit 7? Lesson links surface in meeting summary. |
| Cross-reference with Donna | Email mentions a curriculum unit? Lesson pulls into draft context. |
| Cross-reference with Sam | Writing publicly about something you've built? Pull examples directly from the repo. |
| Cross-reference with Curriculum Feedback Loop (6g) | Tie usage signal to actual lesson content, not just status. |

**Optional extension: PR proposals (1-2 more weeks)**

| Capability | Notes |
|---|---|
| Conversational PR creation | *"Leo, the 2026 FAFSA change affects Unit 12 Lesson 3. Open a PR with updated state-specific guidance."* |
| Leo writes the diff, opens the PR via GitHub API | You review and merge in GitHub UI. |
| Audit trail in Leo | Each PR Leo opens is linked to the conversation that produced it. |

**Decision points during Phase 6i:**
- Indexing scope: full content, or metadata plus excerpts? Default: full content for search; excerpts cached for fast UI.
- PR proposals in v1, or defer? Default: defer. Add once read-only is trusted.
- Agent pipeline state: read-only display, or can Leo trigger an agent run? Default: read-only for v1. Triggering is a Phase 6i.2 conversation.

---

## Phase 7: Chat in Leo (1-2 weeks, optional)

Custom chat surface inside Leo. Uses the same MCP tool definitions from Phase 3, hit directly via Claude API.

| Build | Notes |
|---|---|
| Chat sidebar component | Available on every page. |
| Full-page chat view at `/leo` | For longer conversations. |
| "Ask Leo about this partner" buttons | On partner pages, inline chat with that partner pre-loaded as context. |
| Inline chat on `/brief` | "Leo, what's the most important thing today?" |
| Conversation persistence | Saved to `chat_messages` table. |

**Decision point:** when in the build do you actually need this? If Claude.ai with the MCP server is working, you can defer indefinitely. If the surface integration becomes the bottleneck (e.g., you find yourself constantly switching apps to ask Leo about a partner page you're already on), build it.

---

## Phase 8: TEMU CRM Consulting Upgrades (2-3 weeks)

The bridge between Leo and the Consulting Agent. Adds the schema TEMU CRM needs to support consulting engagements at production scale. Namespaced so the team CRM stays clean while you get a consulting layer.

| Build | Notes |
|---|---|
| `consulting_engagements` table | partner_id, engagement_type, status, start_date, term_months, contract_value, notes. |
| `consulting_placements` table | engagement_id, dimension, stage, placed_by (ai_proposed / jaime_confirmed / jaime_overridden), placed_at, rationale. The 4-stage × 5-dimension transformation map. |
| `consulting_metrics` table | engagement_id, metric_type, current_value, target_value, target_date, last_measured_at. |
| `consulting_deliverables` table | engagement_id, type, status (draft / approved / delivered), draft_content, approved_content, approval timestamps, optional link to source Granola session. |
| `consulting_overrides` table | deliverable_id, original_text, edited_text, pattern_label, applied_to_future_drafts. The override ledger. |
| `consulting_line` table | workstream, ownership (jaime_only / ai_drafts_jaime_approves / ai_only), rationale, last_moved_at. The human/AI line as data. |
| RLS scoped to you only | Team continues to see only the regular CRM. `consulting_*` tables hidden. |
| TEMU CRM polish | Catch-all for small CRM improvements you've identified during Leo build: touchpoint type taxonomy, important_date categories, contact roles. |
| Migration of prototype data | Move the Consulting Agent prototype's seed data (LEAD, Northgate, Riverside) into Supabase as real records. |

This phase is also where the override ledger becomes a global Jaime voice corpus. The patterns captured here can propagate to Donna (Phase 4) so your email drafts benefit from the same voice corrections as your consulting deliverables.

---

## Sibling plan: The Consultant's Cockpit (Productize the Expert)

The Consulting Agent gets its own build plan and its own codebase. This Leo plan does not contain it. Sequencing: Leo Phase 0-7 → Phase 8 (TEMU upgrades) → Consulting Agent productionization.

What the sibling plan will need to address when it gets written:

- Migration from localStorage prototype to Supabase (Phase 8 schema)
- Real data flow: Willow Platform → TEMU CRM → Leo → Consulting Agent
- Whether the production engine routes through Leo's MCP tool surface or calls Anthropic API directly
- Whether the override ledger writes back into Leo's memory or stays cockpit-only
- The integration with Granola transcripts (Margaret) for working-session-prep grounding
- Lesson usage data from Willow Platform: what's the cleanest read path
- Eventual access model: stays consultant-only forever, or opens to one trusted collaborator at some point
- Deployment, staging, and team review cadence

Write that plan after Leo Phases 0-3 are in motion. By then you'll have working data layers to design against, and you'll have a clearer picture of what stays in Leo vs what the Cockpit needs to own.

The Consulting Agent prototype keeps running on mock data through Leo Phase 7. Use it to keep iterating on UX with the team. When Phase 8 lands, the production migration becomes a clean job.

---

## Cross-cutting

### Memory model

Persistent structured memory, organized by entity. Schema:

```sql
CREATE TABLE memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,    -- 'partner', 'project', 'person', 'topic', 'global'
  entity_id TEXT,                -- partner_id, project_id, person_email, etc.
  fact TEXT NOT NULL,
  source_conversation_id UUID,
  source_quote TEXT,
  importance INTEGER DEFAULT 5,  -- 1-10
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ          -- optional, for time-sensitive memories
);
CREATE INDEX idx_memory_entity ON memory(entity_type, entity_id);
```

After each chat, Claude API call extracts relevant facts and persists them. On new chats, relevant memory loads as system context.

### Auth model

One OAuth flow at sign-in, requests all scopes up front:
- Calendar (read, write)
- Gmail (read, modify, send)
- Drive (read) — for Phase 6d

Single Google account. Single user (you). NextAuth handles refresh tokens. RLS stays "allow all" because there's only one user.

### Background jobs

Vercel cron handles:
- Gmail sync (every 5 minutes)
- Calendar sync (every 15 minutes)
- Granola poll (every 2 hours)
- CRM signal recalculation (hourly)
- Daily quote refresh (midnight local)

If job complexity grows, consider Inngest or Trigger.dev. Not needed for v1.

### WW touches inventory

| Surface | Touch |
|---|---|
| Chat / Chief of Staff agent | Leo McGarry |
| Tasks page header | *What's next?* |
| Tasks empty state | *Nothing right now. Nice work.* |
| Calendar agent | Charlie |
| Email agent | Donna |
| Meetings agent | Margaret |
| Writing agent | Sam |
| Drive search agent | Mrs. L |
| Field Intelligence agent | CJ |
| Persona Bench surface | The Writers' Room |
| Slack agent | Josh |
| Weekly review | *Big Block of Cheese Day* |
| Daily brief | Daily WW quote at top |
| Brief subtitle | *What does the day look like?* |
| EOD debrief | *Post mortem* |
| Stuck / blocked state | The "guy in the hole" parable (if you ever want to surface a long-form joy moment) |

Rules: each touch should fit the feature's job and be iconic enough to recognize without explanation. Some features won't get a touch and that's fine.

---

## Decisions still open

These show up in earlier phases and need answers before those phases ship. Worth flagging up front.

1. **Auto-decline meeting rules** — Phase 2. Do you want Leo to ever auto-decline based on rules? Default: no, suggest only.
2. **Send-without-confirmation threshold** — Phase 4. How many successful sends before drafts go without confirmation? Default: 100.
3. **Auto-create vs. confirm extracted tasks from Granola** — Phase 5. Default: confirm for 30 days, then auto with notification.
4. **Custom chat surface timing** — Phase 7. Build during Phase 3-5, or defer until needed?
5. **Granola summaries surfaced on partner pages?** — Phase 5. Default: yes.
6. **Mobile UI for Leo, ever?** — Cross-cutting. Default: no for v1, use Google's native apps on mobile.
7. **Slack channel scope** — Phase 6h. Read all channels or only ones you're explicitly in? Default: only ones you're in.
8. **Sam: publishing pipeline included?** — Phase 6a. Drafting in Sam, publishing where? Default: Sam stays drafting-only for v1; publishing is manual copy-paste to LinkedIn / blog.
9. **Persona Bench: who builds the personas?** — Phase 6f. You write them once, or generated from existing data (teacher persona from real teacher feedback, board persona from board questions)? Default: you write seeds, refine with examples.
10. **CJ source registry** — Phase 6e. Who curates the list of sources to monitor? Default: you maintain manually, with chat command to add new sources.
11. **Voice corpus sharing** — Phase 8. Override ledger feeds Donna's email drafts (and vice versa), or stays cockpit-only? Default: shared. Your voice is your voice.
12. **Curriculum repo PR proposals** — Phase 6i. Build PR-writing in v1, or defer until read-only is trusted? Default: defer.
13. **Agent pipeline triggering from Leo** — Phase 6i. Read-only pipeline visibility, or can Leo trigger an agent run? Default: read-only for v1.

---

## Total scope estimate

| Phase | Estimate |
|---|---|
| Phase 0 (Foundation) | 1-2 weeks |
| Phase 1 (Daily Rhythm) | 2-3 weeks |
| Phase 2 (Charlie / Calendar) | 3-4 weeks |
| Phase 3 (Tools + MCP) | 1-2 weeks |
| Phase 4 (Donna / Email) | 4-6 weeks |
| Phase 5 (Margaret / Meetings) | 2-3 weeks |
| Phase 6a-d (Sam, Decisions, Voice, Mrs. L) | 2-4 weeks |
| Phase 6e (CJ / Field Intelligence) | 1-2 weeks |
| Phase 6f (Writers' Room) | 1 week |
| Phase 6g (Curriculum Feedback Loop) | 1-2 weeks |
| Phase 6h (Josh / Slack) | 2-3 weeks |
| Phase 6i (Curriculum Repo) | 1-2 weeks |
| Phase 7 (Chat in Leo) | 1-2 weeks |
| Phase 8 (TEMU CRM Consulting Upgrades) | 2-3 weeks |
| **Total** | **24-39 weeks (6-10 months)** |

Solo, part-time, alongside curriculum production: more like 10-13 months realistic for the full set. The Consulting Agent (sibling plan) adds another 2-3 months on top.

The good news: every phase ships something usable. You're not waiting nine months for Leo to work; you're using each piece as it lands. Phases 0-3 alone (call it the first 8-13 weeks) give you Leo as a working daily-rhythm and calendar tool with chat via Claude.ai. That's the moment Leo earns its keep.

---

## What I'd do first

If you have a half-day this week to start: **Phase 0**. Rename, auth migration, the "What's next?" header change, the quotes table seed. Sets the foundation for everything else and produces immediate small wins.

If you have a long weekend: **Phase 0 + Phase 1**. Foundation plus the morning brief. That's the moment Leo starts feeling like Leo every morning.
