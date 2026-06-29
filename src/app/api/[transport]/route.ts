import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  fetchTasks,
  fetchAreas,
  fetchProjects,
  fetchCurriculumLessons,
} from "@/lib/database";
import { crmSupabase, isCrmConfigured } from "@/lib/crm-supabase";

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
