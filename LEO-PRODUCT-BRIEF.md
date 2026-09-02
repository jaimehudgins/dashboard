# Leo Product Brief

## Product definition

Leo is a persistent coworker Jaime conducts to accomplish more in less time. It observes work across systems, recommends what matters, prepares or performs appropriate work, preserves context, and asks for approval when Jaime's judgment or a partner relationship is at stake.

Leo is not primarily a task manager. Tasks are an internal coordination mechanism.

## North star

Each day, Leo helps Jaime do what will most improve Willow for teachers, counselors, and students while ensuring urgent partner needs, team responsibilities, and commitments are not missed.

Leo should create:

- More protected time for curriculum thinking.
- Faster, clearer Partner Success work.
- Earlier identification of high-leverage curriculum improvements.
- Reliable memory across partners, meetings, decisions, and work.
- Less time checking systems, reconstructing context, and doing routine administration.

## Jaime's three work domains

### Curriculum

Curriculum work requires planning, uninterrupted thinking, quality judgment, and final approval. Leo should maintain the plan, identify the highest-leverage lesson to improve, assemble evidence and context, and orchestrate review work. Jaime remains the curriculum gatekeeper.

### Partner Success

Partner Success requires timely acknowledgment, quick resolution, relationship awareness, and well-timed follow-up. Leo should monitor incoming signals, investigate what it safely can, prepare responses, track commitments, and protect Jaime from unnecessary interruption. Consulting with two specific partners is a higher-touch mode within this domain. Leo must never send partner communication without approval.

### Willow Leadership

Willow Leadership includes the changing work Jaime does as a company leader and teammate: preparing for panels and conferences, developing new organizational partnerships, shaping platform features, contributing to strategy, and advancing cross-functional initiatives. Because Jaime's involvement changes frequently, Leo should organize this domain around current outcomes and commitments rather than impose a fixed workflow. It should assemble context, identify where the team needs Jaime's judgment, prepare materials, connect internal work to curriculum and partner implications, and preserve decisions and rationale. Leo must never send internal communication without approval.

The domains are lenses, not silos. A major partnership or platform feature may connect Willow Leadership, Partner Success, and Curriculum simultaneously.

## Primary experience

Leo should become one adaptive work surface with four primary destinations:

1. **Today** — one most-critical recommendation, a small on-deck list, the next response window, and a protected curriculum work block.
2. **Attention** — items that need action, organized into Critical, Quick Actions, Commitments, and Watch.
3. **Work** — Curriculum, Partner Success, and Willow Leadership outcomes; implementation, projects, decisions, writing, and accepted improvement candidates.
4. **Ask Leo** — conversational direction, investigation, recall, and action.

The interface should organize around outcomes, not source applications. Gmail, Slack, Google Chat, Granola, Drive, calendar, CRM, GitHub, and the Willow platform supply context and actions behind these surfaces.

## Daily operating rhythm

Leo monitors continuously. Normal Partner Success work is prepared for four Central Time response windows:

- **8:00 a.m.** — overnight issues and the morning recommendation.
- **11:00 a.m.** — first quick-actions batch.
- **2:00 p.m.** — afternoon batch.
- **4:45 p.m.** — final drafts ready for approval and sending by 5:00 p.m.

Critical issues interrupt immediately. Chrome desktop alerts may make a sound for critical items; batch-ready notifications should remain quiet.

### Initial critical criteria

- Security or privacy concern.
- User cannot log in.
- User cannot access an assigned lesson.
- A lesson problem is blocking current or next-day instruction.

General lesson feedback enters the next response window and creates a curriculum-improvement signal. Recency alone does not make a message critical. Leo must show why it assigned an urgency level.

## Partner attention workflow

For each actionable interaction, Leo should produce an attention card containing:

- Partner and organization, matched primarily by email.
- The request and its source.
- Urgency with an explanation.
- Relevant relationship, account, meeting, and prior-interaction context.
- Likely diagnosis and confidence.
- A clear goal for the interaction.
- A prepared response or the next diagnostic question.
- Any detected commitment or curriculum signal.

Leo analyzes every actionable partner message:

- **High confidence:** prepare a complete response and recommend sending it.
- **Medium confidence:** prepare a clarifying response or flag the missing check.
- **Low confidence or sensitive:** provide an internal brief and next diagnostic step without pretending to know the answer.

Gmail remains the source communication client initially. Leo is an attention and action layer, not a replacement inbox.

## Platform support

The existing `/platform` and `/staff-platform` skills use synthetic demo accounts. They can verify current navigation, create accurate how-to instructions, and compare reported behavior with the expected experience. They must not inspect real partner accounts.

Account-specific diagnosis should eventually use a narrowly scoped, read-only support endpoint keyed by email. It should expose only what support requires, such as role, organization, enrollment, assigned lessons, permissions, progress/status, configuration, and relevant recent errors. It should exclude reflections and unrelated student data. Leo may explain or flag required changes but must not change platform accounts.

## Partner and general memory

Memory is a core product capability, not a chat transcript archive. Every memory must retain its source, timestamp, confidence, and review or expiration behavior.

Leo should distinguish:

1. **Identity:** people, organizations, roles, and communication preferences.
2. **Interactions:** meaningful partner, internal, and meeting history.
3. **Commitments:** owner, promise, due date, status, and source.
4. **Current state:** implementation phase, open issues, risks, and next milestones.
5. **Judgments:** inferred/cause hypotheses, relationship health, and follow-up recommendations clearly labeled as inference.

A meaningful partner interaction reveals what is working or what could improve. Routine administration, such as creating an account, should remain searchable but should not affect relationship health.

Private, reversible commitments may be captured automatically from Gmail, Slack, Google Chat, and Granola. Ambiguous commitments require confirmation. External actions always require approval.

## Follow-up recommendations

Leo should recommend, not autonomously send, follow-up contact. Recommendations should consider:

- Time since the last meaningful interaction.
- Unanswered messages.
- Open commitments or unresolved problems.
- Platform usage or inactivity.
- Upcoming implementation events.
- Recent sentiment and relationship-health signals.
- Whether Willow has something genuinely useful to offer.
- Contact frequency and fatigue.
- Evidence freshness and confidence.

Every recommendation must be explainable. The formula should be calibrated from outcomes rather than treated as fixed at launch.

## Curriculum intelligence

Leo should index approximately 500 lessons from the curriculum repository and GitHub without replacing Git as the source of truth. The registry should track:

- Stable lesson ID, unit, path, revision, and pipeline stage.
- Latest pipeline quality report.
- Latest Human Curriculum Editor scores and findings.
- Last human review.
- School usage dates from the platform schedule CSV.
- Ratings and text responses from the weekly platform-feedback CSV.
- Related Partner Success, Slack, and Granola evidence.
- Open evidence-backed candidates and experimental ideas.

### Review triggers

- **Pipeline-triggered:** a lesson is newly generated or materially changed.
- **Schedule-triggered:** initial review eight weeks before expected use; unresolved issues become more urgent at six weeks.
- **Signal-triggered:** credible partner, team, meeting, or platform feedback indicates a problem.
- **Rotating audit:** a small sample of older or low-feedback lessons to detect hidden weaknesses.

The two-to-four-week window before use should emphasize implementation readiness, not major redesign.

### Daily curriculum recommendation

Leo should recommend the single lesson where Jaime's judgment can create the most value. Ranking should consider upcoming use, reach, Human Curriculum Editor results, severity and recurrence of field evidence, partner signals, strategic importance, confidence, and estimated effort.

The recommendation opens a work package with:

- The current lesson and recent changes.
- Pipeline and Human Curriculum Editor reports.
- Exact field evidence with sources.
- Relevant platform, Slack, and Granola context.
- The highest-confidence problems and proposed revisions.
- A clear goal and estimated work-session length.
- One optional experimental improvement idea.

Evidence-backed improvement candidates and experimental ideas remain separate. Leo may create either automatically, but only Jaime may accept a candidate into the official repository workflow or approve curriculum changes.

## Authority boundaries

Leo may automatically:

- Read, classify, connect, summarize, and rank information.
- Gather partner, curriculum, platform, Willow Leadership, and relationship context.
- Prepare drafts and how-to instructions.
- Create private, reversible attention items and candidate records.
- Detect likely commitments and follow-ups.
- Run scheduled or event-triggered curriculum reviews.
- Challenge Jaime's stated priority with evidence.

Leo must ask before:

- Sending email, Slack, Google Chat, text, or meeting communication.
- Creating or changing meetings.
- Changing partner or platform data.
- Making promises or communicating deadlines.
- Escalating an issue to another person.
- Accepting a curriculum candidate or changing curriculum.
- Recording an ambiguous or sensitive inference as fact.

## Existing feature disposition

- Merge **Situation Room** and **Morning Brief** into **Today**.
- Make **End of Day** a timed Today mode rather than permanent navigation.
- Turn **Mail**, **Slack**, **Meetings**, and **Note Catcher** into sources feeding **Attention**, with deeper source views available when needed.
- Place projects, curriculum, decisions, backlog, writing, travel, and implementation under **Work**.
- Use Smart Insights as ranking inputs; show an insight only when it changes a recommendation.
- Keep Quick Capture, focus mode, search, calendar, CRM, Drive, Granola, GitHub, and confirmation gates.
- Keep specialist and persona tools available as optional modules rather than top-level destinations.
- Do not delete existing surfaces until the replacement workflow proves useful.

## Phased plan

### Phase 1 — Attention and memory pilot

- Establish the sourced partner-memory and commitment model.
- Build the Attention queue over existing Gmail and Granola integrations.
- Add Critical and Quick Actions lanes with confidence-based drafts.
- Implement the four daily batches and true closed-tab Chrome Web Push.
- Measure response preparation time, interruptions, approvals, and corrections.

### Phase 2 — Curriculum intelligence pilot

- Build a rebuildable curriculum registry from GitHub and repository reports.
- Ingest the downloadable school schedule CSV.
- Ingest the weekly lesson-feedback CSV.
- Run the Human Curriculum Editor at the defined triggers.
- Produce evidence-backed candidates, a separate ideas lane, and one daily recommendation.
- Route accepted candidates into the existing curriculum workflow.

### Phase 3 — Context expansion

- Add Slack and Google Chat as attention, memory, commitment, and curriculum-signal sources.
- Design the read-only platform support snapshot with the platform team.
- Add lightweight capture for meaningful iMessage conversations rather than full inbox ingestion.
- Calibrate urgency and follow-up recommendations from Jaime's decisions.

### Phase 4 — Coworker orchestration

- Let Leo initiate bounded background investigation and review work.
- Coordinate approved work across Leo, Codex, Claude Code, and curriculum skills.
- Return completed work packages and focused approval requests.
- Reduce or hide legacy navigation after the core workflow demonstrates value.

## Measures of success

- More protected curriculum-thinking time each week.
- Less time spent checking Gmail, Slack, and Google Chat.
- Faster partner acknowledgment and resolution.
- Fewer interruptions without missed critical issues.
- Commitments captured and completed reliably.
- High acceptance rate for Leo's most-critical recommendation.
- Curriculum issues identified at least six to eight weeks before use.
- Fewer AI-sounding or weak-activity defects reaching Jaime's final review.
- Clear evidence that the product, partner experience, and company improved because Jaime spent more time on high-judgment work.

## Non-goals

- Rebuild Gmail, Slack, Google Chat, or Granola.
- Send partner or internal communication autonomously.
- Change partner accounts.
- Let isolated feedback automatically change curriculum.
- Replace GitHub or the curriculum repository as source of truth.
- Optimize engagement with Leo itself; optimize useful outcomes and recovered attention.
