import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  fetchTasks,
  fetchAreas,
  fetchProjects,
  fetchCurriculumLessons,
  createTask,
  updateTask,
} from "@/lib/database";
import {
  crmSupabase,
  isCrmConfigured,
  createPartnerFollowUp,
} from "@/lib/crm-supabase";
import { rememberFact, recallMemories, forgetMemory } from "@/lib/memory";
import { Task } from "@/types";
import {
  getGoogleAccessToken,
  isGoogleServerConfigured,
} from "@/lib/google-auth";
import {
  listAllEvents,
  listCalendars,
  ownedCalendars,
  queryFreeBusy,
  findFreeSlots,
  createEvent,
} from "@/lib/google-calendar";
import {
  searchMessages,
  getThread,
  createDraft,
  sendEmail,
  getReplyContext,
  archiveThread,
} from "@/lib/gmail";

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const handler = createMcpHandler(
  (server) => {
    // ---- Tasks (dashboard Supabase) ----
    server.registerTool(
      "list_tasks",
      {
        title: "List tasks",
        description:
          "List Leo's tasks. Filter by status, area name, or due date. Returns title, status, priority, due date, area, and project.",
        inputSchema: {
          status: z
            .enum(["active", "completed", "all"])
            .optional()
            .describe("Default 'active' (not completed)."),
          area: z.string().optional().describe("Filter by area name (fuzzy)."),
          dueBefore: z
            .string()
            .optional()
            .describe("Only tasks due on/before this YYYY-MM-DD."),
          limit: z.number().int().min(1).max(200).optional(),
        },
      },
      async ({ status = "active", area, dueBefore, limit = 50 }) => {
        const [tasks, areas, projects] = await Promise.all([
          fetchTasks(),
          fetchAreas(),
          fetchProjects(),
        ]);
        const areaName = (id?: string) =>
          areas.find((a) => a.id === id)?.name;
        const projName = (id?: string | null) =>
          projects.find((p) => p.id === id)?.name;

        let rows = tasks.filter((t) => !t.parentTaskId);
        if (status === "active") rows = rows.filter((t) => t.status !== "completed");
        else if (status === "completed")
          rows = rows.filter((t) => t.status === "completed");
        if (area) {
          const q = area.toLowerCase();
          rows = rows.filter((t) => areaName(t.areaId)?.toLowerCase().includes(q));
        }
        if (dueBefore) {
          const cutoff = new Date(`${dueBefore}T23:59:59`).getTime();
          rows = rows.filter((t) => t.dueDate && new Date(t.dueDate).getTime() <= cutoff);
        }
        return ok(
          rows.slice(0, limit).map((t) => ({
            title: t.title,
            status: t.status,
            priority: t.priority,
            due: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : null,
            area: areaName(t.areaId) ?? null,
            project: projName(t.projectId) ?? null,
          })),
        );
      },
    );

    server.registerTool(
      "search_tasks",
      {
        title: "Search tasks",
        description:
          "Search tasks by keyword in the title or description (case-insensitive).",
        inputSchema: {
          query: z.string().describe("Keyword to search for."),
          limit: z.number().int().min(1).max(100).optional(),
        },
      },
      async ({ query, limit = 25 }) => {
        const [tasks, areas] = await Promise.all([fetchTasks(), fetchAreas()]);
        const q = query.toLowerCase();
        const rows = tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.description || "").toLowerCase().includes(q),
        );
        return ok(
          rows.slice(0, limit).map((t) => ({
            title: t.title,
            status: t.status,
            priority: t.priority,
            due: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : null,
            area: areas.find((a) => a.id === t.areaId)?.name ?? null,
          })),
        );
      },
    );

    // ---- Partner CRM (separate Supabase) ----
    server.registerTool(
      "list_partners",
      {
        title: "List partners",
        description:
          "List partner schools/districts from the CRM with status, health, last contact, and staff lead.",
        inputSchema: {
          status: z.string().optional().describe("Filter by status (fuzzy)."),
          limit: z.number().int().min(1).max(200).optional(),
        },
      },
      async ({ status, limit = 50 }) => {
        if (!isCrmConfigured) return ok({ error: "CRM not configured" });
        const { data, error } = await crmSupabase
          .from("partners")
          .select(
            "name, status, priority, relationship_health, renewal_status, last_contact_date, city_state, willow_staff_lead",
          )
          .order("name");
        if (error) return ok({ error: error.message });
        let rows = data || [];
        if (status) {
          const q = status.toLowerCase();
          rows = rows.filter((p) => (p.status || "").toLowerCase().includes(q));
        }
        return ok(rows.slice(0, limit));
      },
    );

    server.registerTool(
      "get_partner",
      {
        title: "Get partner",
        description:
          "Get the full CRM record for one partner by name (fuzzy match).",
        inputSchema: { name: z.string().describe("Partner name to look up.") },
      },
      async ({ name }) => {
        if (!isCrmConfigured) return ok({ error: "CRM not configured" });
        const { data, error } = await crmSupabase
          .from("partners")
          .select("*")
          .ilike("name", `%${name}%`)
          .limit(1);
        if (error) return ok({ error: error.message });
        if (!data || data.length === 0) return ok({ error: `No partner matching "${name}"` });
        return ok(data[0]);
      },
    );

    server.registerTool(
      "search_touchpoints",
      {
        title: "Search touchpoints",
        description:
          "Search CRM touchpoints (logged interactions) by partner name and/or keyword. Returns the most recent first.",
        inputSchema: {
          partner: z.string().optional().describe("Partner name (fuzzy)."),
          query: z.string().optional().describe("Keyword in title or notes."),
          limit: z.number().int().min(1).max(100).optional(),
        },
      },
      async ({ partner, query, limit = 25 }) => {
        if (!isCrmConfigured) return ok({ error: "CRM not configured" });
        const { data: partners } = await crmSupabase
          .from("partners")
          .select("id, name");
        const nameById = new Map((partners || []).map((p) => [p.id, p.name]));
        let partnerIds: string[] | null = null;
        if (partner) {
          const q = partner.toLowerCase();
          partnerIds = (partners || [])
            .filter((p) => (p.name || "").toLowerCase().includes(q))
            .map((p) => p.id);
          if (partnerIds.length === 0) return ok({ error: `No partner matching "${partner}"` });
        }
        let req = crmSupabase
          .from("touchpoints")
          .select("partner_id, title, type, date, notes, next_steps")
          .order("date", { ascending: false })
          .limit(limit);
        if (partnerIds) req = req.in("partner_id", partnerIds);
        const { data, error } = await req;
        if (error) return ok({ error: error.message });
        let rows = data || [];
        if (query) {
          const q = query.toLowerCase();
          rows = rows.filter(
            (t) =>
              (t.title || "").toLowerCase().includes(q) ||
              (t.notes || "").toLowerCase().includes(q),
          );
        }
        return ok(
          rows.map((t) => ({
            partner: nameById.get(t.partner_id) ?? "Unknown",
            title: t.title,
            type: t.type,
            date: t.date,
            notes: t.notes,
            next_steps: t.next_steps,
          })),
        );
      },
    );

    // ---- Curriculum (dashboard Supabase) ----
    server.registerTool(
      "list_curriculum_lessons",
      {
        title: "List curriculum lessons",
        description:
          "List curriculum lessons with their status. Filter by status or unit.",
        inputSchema: {
          status: z.string().optional().describe("Filter by status (fuzzy)."),
          unit: z.string().optional().describe("Filter by unit (fuzzy)."),
        },
      },
      async ({ status, unit }) => {
        const lessons = await fetchCurriculumLessons();
        let rows = lessons as unknown as Record<string, unknown>[];
        if (status) {
          const q = status.toLowerCase();
          rows = rows.filter((l) => String(l.status || "").toLowerCase().includes(q));
        }
        if (unit) {
          const q = unit.toLowerCase();
          rows = rows.filter((l) => String(l.unit || "").toLowerCase().includes(q));
        }
        return ok(rows);
      },
    );

    // ---- Persistent memory (dashboard Supabase `memory` table) ----
    server.registerTool(
      "recall",
      {
        title: "Recall memories",
        description:
          "Recall previously stored facts about an entity (a partner, project, person, topic, or global). Call this at the start of a conversation about someone/something to load what Leo already knows. Filter by entity and/or keyword; expired memories are excluded.",
        inputSchema: {
          entityType: z
            .enum(["partner", "project", "person", "topic", "global"])
            .optional(),
          entityId: z
            .string()
            .optional()
            .describe("e.g. a partner name/id, project id, or person email."),
          query: z.string().optional().describe("Keyword to match in the fact."),
          limit: z.number().int().min(1).max(100).optional(),
        },
      },
      async ({ entityType, entityId, query, limit }) => {
        const rows = await recallMemories({ entityType, entityId, query, limit });
        return ok(
          rows.map((m) => ({
            id: m.id,
            entity: `${m.entity_type}${m.entity_id ? `:${m.entity_id}` : ""}`,
            fact: m.fact,
            importance: m.importance,
            recorded: m.created_at,
          })),
        );
      },
    );

    server.registerTool(
      "remember",
      {
        title: "Remember a fact",
        description:
          "Store a durable fact for future conversations — a preference, a decision, a piece of context worth keeping. Tag it to an entity so it can be recalled later. Use this when the user shares something they'd want Leo to remember.",
        inputSchema: {
          entityType: z.enum([
            "partner",
            "project",
            "person",
            "topic",
            "global",
          ]),
          entityId: z
            .string()
            .optional()
            .describe("What the fact is about (partner name, project, email)."),
          fact: z.string().describe("The fact to remember, stated plainly."),
          sourceQuote: z
            .string()
            .optional()
            .describe("Optional verbatim quote this was drawn from."),
          importance: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe("1-10, default 5."),
          expiresAt: z
            .string()
            .optional()
            .describe("Optional ISO timestamp after which the fact is stale."),
        },
      },
      async ({ entityType, entityId, fact, sourceQuote, importance, expiresAt }) => {
        const row = await rememberFact({
          entityType,
          entityId,
          fact,
          sourceQuote,
          importance,
          expiresAt,
        });
        return ok({ saved: true, id: row.id });
      },
    );

    server.registerTool(
      "forget",
      {
        title: "Forget a memory",
        description:
          "Delete a stored memory by its id (from a prior recall) — when a fact is wrong or no longer true.",
        inputSchema: { id: z.string().describe("The memory id to delete.") },
      },
      async ({ id }) => {
        await forgetMemory(id);
        return ok({ forgotten: true, id });
      },
    );

    // ---- Writes (confirm-gated) ----
    // Each write tool previews the change when `confirm` is unset and only
    // executes when confirm=true, so there's an explicit approval step.
    const CONFIRM_NOTE =
      "This writes to live data. Show the user exactly what will change and only set confirm=true after they approve.";

    server.registerTool(
      "create_task",
      {
        title: "Create task",
        description: `Create a task in Leo. ${CONFIRM_NOTE}`,
        inputSchema: {
          title: z.string(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          dueDate: z.string().optional().describe("YYYY-MM-DD"),
          area: z.string().optional().describe("Area name (fuzzy)."),
          project: z.string().optional().describe("Project name (fuzzy)."),
          description: z.string().optional(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ title, priority, dueDate, area, project, description, confirm }) => {
        const [areas, projects] = await Promise.all([
          fetchAreas(),
          fetchProjects(),
        ]);
        const areaMatch = area
          ? areas.find((a) => a.name.toLowerCase().includes(area.toLowerCase()))
          : undefined;
        const projMatch = project
          ? projects.find((p) =>
              p.name.toLowerCase().includes(project.toLowerCase()),
            )
          : undefined;
        const preview = {
          title,
          priority: priority || "medium",
          dueDate: dueDate || null,
          area: areaMatch?.name || null,
          project: projMatch?.name || null,
        };
        if (!confirm)
          return ok({ pending: true, action: "create_task", task: preview, note: "Re-run with confirm=true to save." });

        const task: Task = {
          id: crypto.randomUUID(),
          title,
          description,
          priority: priority || "medium",
          status: "pending",
          projectId: projMatch?.id ?? null,
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : undefined,
          createdAt: new Date(),
          focusMinutes: 0,
          areaId: areaMatch?.id,
        };
        await createTask(task);
        return ok({ created: true, id: task.id, title });
      },
    );

    server.registerTool(
      "update_task",
      {
        title: "Update task",
        description: `Update an existing task found by title. ${CONFIRM_NOTE}`,
        inputSchema: {
          taskTitle: z.string().describe("Title (or part) of the task."),
          newTitle: z.string().optional(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          dueDate: z.string().optional().describe("YYYY-MM-DD"),
          status: z
            .enum(["pending", "in_progress", "completed", "blocked"])
            .optional(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ taskTitle, newTitle, priority, dueDate, status, confirm }) => {
        const tasks = await fetchTasks();
        const matches = tasks.filter(
          (t) => !t.parentTaskId && t.title.toLowerCase().includes(taskTitle.toLowerCase()),
        );
        if (matches.length === 0) return ok({ error: `No task matching "${taskTitle}"` });
        if (matches.length > 1)
          return ok({ error: "Multiple tasks match — be more specific.", candidates: matches.slice(0, 8).map((t) => t.title) });
        const task = matches[0];

        const changes: Record<string, unknown> = {};
        if (newTitle) changes.title = newTitle;
        if (priority) changes.priority = priority;
        if (dueDate) changes.dueDate = dueDate;
        if (status) changes.status = status;
        if (!confirm)
          return ok({ pending: true, action: "update_task", task: task.title, changes, note: "Re-run with confirm=true to apply." });

        const updated: Task = {
          ...task,
          title: newTitle ?? task.title,
          priority: priority ?? task.priority,
          status: status ?? task.status,
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : task.dueDate,
          completedAt:
            status === "completed" ? new Date() : task.completedAt,
        };
        await updateTask(updated);
        return ok({ updated: true, title: updated.title });
      },
    );

    server.registerTool(
      "complete_task",
      {
        title: "Complete task",
        description: `Mark a task done (found by title). ${CONFIRM_NOTE}`,
        inputSchema: {
          taskTitle: z.string().describe("Title (or part) of the task."),
          confirm: z.boolean().optional(),
        },
      },
      async ({ taskTitle, confirm }) => {
        const tasks = await fetchTasks();
        const matches = tasks.filter(
          (t) =>
            !t.parentTaskId &&
            t.status !== "completed" &&
            t.title.toLowerCase().includes(taskTitle.toLowerCase()),
        );
        if (matches.length === 0) return ok({ error: `No open task matching "${taskTitle}"` });
        if (matches.length > 1)
          return ok({ error: "Multiple tasks match — be more specific.", candidates: matches.slice(0, 8).map((t) => t.title) });
        const task = matches[0];
        if (!confirm)
          return ok({ pending: true, action: "complete_task", task: task.title, note: "Re-run with confirm=true to complete." });
        await updateTask({ ...task, status: "completed", completedAt: new Date() });
        return ok({ completed: true, title: task.title });
      },
    );

    server.registerTool(
      "create_partner_follow_up",
      {
        title: "Create partner follow-up",
        description: `Create a follow-up task in the CRM tagged to a partner (due in N days, default 2). ${CONFIRM_NOTE}`,
        inputSchema: {
          partner: z.string().describe("Partner name (fuzzy)."),
          dueInDays: z.number().int().min(0).max(90).optional(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ partner, dueInDays, confirm }) => {
        if (!isCrmConfigured) return ok({ error: "CRM not configured" });
        const { data, error } = await crmSupabase
          .from("partners")
          .select("id, name")
          .ilike("name", `%${partner}%`)
          .limit(3);
        if (error) return ok({ error: error.message });
        if (!data || data.length === 0) return ok({ error: `No partner matching "${partner}"` });
        if (data.length > 1)
          return ok({ error: "Multiple partners match — be more specific.", candidates: data.map((p) => p.name) });
        const p = data[0];
        if (!confirm)
          return ok({ pending: true, action: "create_partner_follow_up", partner: p.name, dueInDays: dueInDays ?? 2, note: "Re-run with confirm=true to create." });
        await createPartnerFollowUp({ partnerId: p.id, partnerName: p.name, dueInDays });
        return ok({ created: true, partner: p.name });
      },
    );

    // ---- Calendar (Google, headless via stored refresh token) ----
    const NO_GOOGLE = {
      error:
        "Google isn't connected. Capture a refresh token at /api/google/refresh-token and set GOOGLE_REFRESH_TOKEN.",
    };

    server.registerTool(
      "list_calendar_events",
      {
        title: "List calendar events",
        description:
          "List the user's own calendar events in a date range, optionally filtered by a search term (title/attendees/location). For 'next'/'upcoming', search from today forward.",
        inputSchema: {
          start: z.string().describe("ISO datetime or YYYY-MM-DD"),
          end: z.string().describe("ISO datetime or YYYY-MM-DD"),
          query: z.string().optional(),
        },
      },
      async ({ start, end, query }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        const token = await getGoogleAccessToken();
        const toStart = (s: string) =>
          s.includes("T") ? s : new Date(`${s}T00:00:00`).toISOString();
        const toEnd = (s: string) =>
          s.includes("T") ? s : new Date(`${s}T23:59:59`).toISOString();
        const { events } = await listAllEvents(token, toStart(start), toEnd(end), {
          ownedOnly: true,
        });
        const q = (query || "").toLowerCase();
        const rows = (q
          ? events.filter(
              (e) =>
                (e.title || "").toLowerCase().includes(q) ||
                (e.location || "").toLowerCase().includes(q) ||
                (e.attendees || []).some(
                  (a) =>
                    (a.email || "").toLowerCase().includes(q) ||
                    (a.displayName || "").toLowerCase().includes(q),
                ),
            )
          : events
        ).slice(0, 50);
        return ok(
          rows.map((e) => ({
            title: e.title,
            start: e.start,
            end: e.end,
            allDay: e.allDay,
            location: e.location,
            attendees: (e.attendees || [])
              .map((a) => a.displayName || a.email)
              .filter(Boolean),
            hasMeet: !!e.hangoutLink,
          })),
        );
      },
    );

    server.registerTool(
      "find_calendar_time",
      {
        title: "Find open time",
        description:
          "Find open slots of a given length within working hours (9am–5pm weekdays) across the user's own calendars.",
        inputSchema: {
          durationMinutes: z.number().int(),
          earliestDate: z.string().describe("YYYY-MM-DD"),
          latestDate: z.string().describe("YYYY-MM-DD"),
          partOfDay: z.enum(["morning", "afternoon", "any"]).optional(),
        },
      },
      async ({ durationMinutes, earliestDate, latestDate, partOfDay }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        const token = await getGoogleAccessToken();
        const now = new Date();
        const rangeStart = new Date(`${earliestDate}T00:00:00`);
        const effectiveStart = rangeStart.getTime() < now.getTime() ? now : rangeStart;
        const rangeEnd = new Date(`${latestDate}T23:59:59`);
        const calendars = await listCalendars(token);
        const busy = await queryFreeBusy(
          token,
          effectiveStart.toISOString(),
          rangeEnd.toISOString(),
          ownedCalendars(calendars).map((c) => c.id),
        );
        let slots = findFreeSlots({
          busy,
          rangeStart: effectiveStart,
          rangeEnd,
          durationMin: durationMinutes || 30,
        });
        if (partOfDay === "morning")
          slots = slots.filter((s) => new Date(s.start).getHours() < 12);
        else if (partOfDay === "afternoon")
          slots = slots.filter((s) => new Date(s.start).getHours() >= 12);
        return ok(slots.slice(0, 12));
      },
    );

    server.registerTool(
      "create_calendar_event",
      {
        title: "Create calendar event",
        description: `Create an event on the user's primary calendar. ${CONFIRM_NOTE}`,
        inputSchema: {
          title: z.string(),
          date: z.string().describe("YYYY-MM-DD"),
          startTime: z.string().optional().describe("HH:mm (omit for all-day)"),
          endTime: z.string().optional().describe("HH:mm"),
          allDay: z.boolean().optional(),
          location: z.string().optional(),
          attendees: z.array(z.string()).optional().describe("Guest emails."),
          addMeet: z.boolean().optional(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ title, date, startTime, endTime, allDay, location, attendees, addMeet, confirm }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        const token = await getGoogleAccessToken();
        const isAllDay = allDay || (!startTime && !endTime);
        const preview = {
          title,
          when: isAllDay
            ? `${date} (all day)`
            : `${date} ${startTime}–${endTime}`,
          location: location || null,
          attendees: attendees || [],
          meet: !!addMeet,
        };
        if (!confirm)
          return ok({ pending: true, action: "create_calendar_event", event: preview, note: "Re-run with confirm=true to create." });

        const calendars = await listCalendars(token);
        const target =
          ownedCalendars(calendars).find((c) => c.primary) ||
          ownedCalendars(calendars)[0];
        if (!target) return ok({ error: "No writable calendar found." });
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        await createEvent(token, {
          calendarId: target.id,
          title,
          allDay: isAllDay,
          start: isAllDay ? date : `${date}T${startTime}:00`,
          end: isAllDay ? date : `${date}T${endTime}:00`,
          timeZone: tz,
          location,
          attendees,
          addMeet,
        });
        return ok({ created: true, title, when: preview.when });
      },
    );

    // ---- Gmail (read-only; drafting comes in Phase 4) ----
    server.registerTool(
      "search_email",
      {
        title: "Search email",
        description:
          "Search Gmail using Gmail query syntax (e.g. 'from:sarah', 'is:unread', 'in:inbox newer_than:7d'). Returns sender, subject, date, and snippet.",
        inputSchema: {
          query: z.string().optional().describe("Gmail search; default in:inbox."),
          limit: z.number().int().min(1).max(25).optional(),
        },
      },
      async ({ query, limit }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        const token = await getGoogleAccessToken();
        const rows = await searchMessages(token, query || "in:inbox", limit ?? 10);
        return ok(rows);
      },
    );

    server.registerTool(
      "get_email_thread",
      {
        title: "Get email thread",
        description:
          "Get the full messages of an email thread by threadId (from search_email), including plain-text bodies.",
        inputSchema: { threadId: z.string() },
      },
      async ({ threadId }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        const token = await getGoogleAccessToken();
        const t = await getThread(token, threadId);
        // Return text bodies only — the raw HTML is for the inbox UI, not Claude.
        return ok({
          id: t.id,
          messages: t.messages.map((m) => ({
            from: m.from,
            to: m.to,
            subject: m.subject,
            date: m.date,
            snippet: m.snippet,
            body: m.body,
          })),
        });
      },
    );

    // ---- Email actions (Donna; confirm-gated, sends always confirm) ----
    server.registerTool(
      "draft_email",
      {
        title: "Draft email",
        description: `Save a Gmail draft (does NOT send). ${CONFIRM_NOTE}`,
        inputSchema: {
          to: z.string().describe("Recipient email(s), comma-separated."),
          subject: z.string(),
          body: z.string(),
          cc: z.string().optional(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ to, subject, body, cc, confirm }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        if (!confirm)
          return ok({ pending: true, action: "draft_email", email: { to, cc, subject, body }, note: "Re-run with confirm=true to save the draft." });
        const token = await getGoogleAccessToken();
        const draft = await createDraft(token, { to, subject, body, cc });
        return ok({ drafted: true, draftId: draft.id });
      },
    );

    server.registerTool(
      "send_email",
      {
        title: "Send email",
        description: `Send an email now. Always show the full message and get explicit approval first. ${CONFIRM_NOTE}`,
        inputSchema: {
          to: z.string().describe("Recipient email(s), comma-separated."),
          subject: z.string(),
          body: z.string(),
          cc: z.string().optional(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ to, subject, body, cc, confirm }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        if (!confirm)
          return ok({ pending: true, action: "send_email", email: { to, cc, subject, body }, note: "This sends a real email. Re-run with confirm=true only after the user approves." });
        const token = await getGoogleAccessToken();
        const sent = await sendEmail(token, { to, subject, body, cc });
        return ok({ sent: true, to, subject, messageId: sent.id });
      },
    );

    server.registerTool(
      "reply_to_email",
      {
        title: "Reply to email thread",
        description: `Reply to an existing thread (from search_email/get_email_thread). Recipient, subject, and threading are derived from the thread. ${CONFIRM_NOTE}`,
        inputSchema: {
          threadId: z.string(),
          body: z.string(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ threadId, body, confirm }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        const token = await getGoogleAccessToken();
        const ctx = await getReplyContext(token, threadId);
        if (!confirm)
          return ok({ pending: true, action: "reply_to_email", email: { to: ctx.to, subject: ctx.subject, body }, note: "This sends a real reply. Re-run with confirm=true only after the user approves." });
        const sent = await sendEmail(
          token,
          {
            to: ctx.to,
            subject: ctx.subject,
            body,
            inReplyTo: ctx.inReplyTo,
            references: ctx.references,
          },
          threadId,
        );
        return ok({ sent: true, to: ctx.to, subject: ctx.subject, messageId: sent.id });
      },
    );

    server.registerTool(
      "archive_email",
      {
        title: "Archive email thread",
        description: `Remove a thread from the inbox. ${CONFIRM_NOTE}`,
        inputSchema: {
          threadId: z.string(),
          confirm: z.boolean().optional(),
        },
      },
      async ({ threadId, confirm }) => {
        if (!isGoogleServerConfigured) return ok(NO_GOOGLE);
        if (!confirm)
          return ok({ pending: true, action: "archive_email", threadId, note: "Re-run with confirm=true to archive." });
        const token = await getGoogleAccessToken();
        await archiveThread(token, threadId);
        return ok({ archived: true, threadId });
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 },
);

// Optional bearer-token guard: enforced only when MCP_TOKEN is set, so the
// server is open for local testing and protected in production.
async function guarded(req: Request): Promise<Response> {
  const token = process.env.MCP_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${token}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
