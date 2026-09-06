import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { crmSupabase, isCrmConfigured } from "@/lib/crm-supabase";
import {
  createTemuRecord,
  isTemuConfigured,
  isTemuResource,
  TemuApiError,
  TemuExportData,
  TemuExportResult,
  TemuResource,
} from "@/lib/temu-api";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESOURCE_FIELDS: Record<TemuResource, readonly string[]> = {
  contacts: ["name", "role", "email", "phone", "is_primary_contact"],
  attachments: ["name", "url", "type"],
  touchpoints: [
    "school_id",
    "contact_id",
    "contact_source_external_id",
    "date",
    "author",
    "title",
    "notes",
    "next_steps",
    "next_steps_due_date",
    "type",
  ],
  "follow-up-tasks": [
    "touchpoint_id",
    "touchpoint_source_external_id",
    "task",
    "due_date",
    "completed",
    "status",
    "notes",
  ],
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeData(
  resource: TemuResource,
  raw: Record<string, unknown>,
): TemuExportData {
  const partnerId = raw.partner_id;
  const sourceExternalId = raw.source_external_id;
  if (typeof partnerId !== "string" || !UUID_PATTERN.test(partnerId)) {
    throw new TemuApiError("A valid partner is required", 400);
  }
  if (
    typeof sourceExternalId !== "string" ||
    !sourceExternalId.trim() ||
    sourceExternalId.length > 255
  ) {
    throw new TemuApiError("A stable source ID is required", 400);
  }

  const data: TemuExportData = {
    partner_id: partnerId,
    source_external_id: sourceExternalId.trim(),
  };
  if (typeof raw.source_created_at === "string") {
    data.source_created_at = raw.source_created_at;
  }
  if (isObject(raw.source_metadata)) {
    data.source_metadata = raw.source_metadata;
  }
  for (const field of RESOURCE_FIELDS[resource]) {
    if (raw[field] !== undefined) data[field] = raw[field];
  }
  return data;
}

function errorStatus(error: TemuApiError): number {
  return error.status >= 400 && error.status < 600 ? error.status : 502;
}

async function findExistingContact(
  partnerId: string,
  email: string,
): Promise<{ id: string } | null> {
  if (!isCrmConfigured) return null;

  const { data, error } = await crmSupabase
    .from("contacts")
    .select("id")
    .eq("partner_id", partnerId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findExistingSourceRecord(
  table: "touchpoints" | "follow_up_tasks",
  partnerId: string,
  sourceExternalId: string,
): Promise<{ id: string; partner_id: string } | null> {
  if (!isCrmConfigured) return null;

  const { data, error } = await crmSupabase
    .from(table)
    .select("id, partner_id")
    .eq("source_system", "leo:temu")
    .eq("source_external_id", sourceExternalId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data && data.partner_id !== partnerId) {
    throw new TemuApiError(
      "This source was already exported to a different TEMU partner",
      409,
      "SOURCE_PARTNER_CONFLICT",
    );
  }
  return data;
}

// User-initiated export. The explicit `confirmed: true` accompanies the final
// UI click; previews and background processes cannot create TEMU records.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isTemuConfigured()) {
    return NextResponse.json(
      { error: "TEMU export is not configured" },
      { status: 503 },
    );
  }

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (body.confirmed !== true) {
      return NextResponse.json(
        { error: "Explicit confirmation is required" },
        { status: 409 },
      );
    }
    if (typeof body.resource !== "string" || !isTemuResource(body.resource)) {
      return NextResponse.json({ error: "Unknown TEMU resource" }, { status: 400 });
    }
    if (!isObject(body.data)) {
      return NextResponse.json({ error: "Export data is required" }, { status: 400 });
    }
    const newContact = body.new_contact;
    if (newContact !== undefined) {
      if (body.resource !== "touchpoints" || !isObject(newContact)) {
        return NextResponse.json(
          { error: "A new contact requires a touchpoint export" },
          { status: 400 },
        );
      }
      if (
        typeof newContact.source_external_id !== "string" ||
        !newContact.source_external_id.trim() ||
        newContact.source_external_id.length > 255 ||
        typeof newContact.name !== "string" ||
        !newContact.name.trim() ||
        typeof newContact.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newContact.email.trim()) ||
        (newContact.role !== undefined &&
          newContact.role !== null &&
          typeof newContact.role !== "string")
      ) {
        return NextResponse.json(
          { error: "The new contact needs a name, valid email, and stable source ID" },
          { status: 400 },
        );
      }
    }
    if (body.follow_up_tasks !== undefined) {
      if (
        body.resource !== "touchpoints" ||
        !Array.isArray(body.follow_up_tasks)
      ) {
        return NextResponse.json(
          { error: "Follow-up tasks require a touchpoint export" },
          { status: 400 },
        );
      }
      if (body.follow_up_tasks.length > 10) {
        return NextResponse.json(
          { error: "No more than 10 follow-up tasks may be exported at once" },
          { status: 400 },
        );
      }
      if (body.follow_up_tasks.some((task) => !isObject(task))) {
        return NextResponse.json(
          { error: "Every follow-up task must be an object" },
          { status: 400 },
        );
      }
      const invalidTask = body.follow_up_tasks.find(
        (task) =>
          typeof task.source_external_id !== "string" ||
          !task.source_external_id.trim() ||
          task.source_external_id.length > 255 ||
          typeof task.task !== "string" ||
          !task.task.trim(),
      );
      if (invalidTask) {
        return NextResponse.json(
          { error: "Every follow-up task needs a task and stable source ID" },
          { status: 400 },
        );
      }
    }

    const data = sanitizeData(body.resource, body.data);
    let contactResult: {
      requested: boolean;
      created: boolean;
      duplicate: boolean;
      existing: boolean;
    } | null = null;

    if (isObject(newContact)) {
      if (data.contact_id || data.contact_source_external_id) {
        return NextResponse.json(
          { error: "Choose either the matched contact or the suggested new contact" },
          { status: 400 },
        );
      }

      const normalizedEmail = String(newContact.email).trim().toLowerCase();
      const existingContact = await findExistingContact(
        data.partner_id,
        normalizedEmail,
      );
      if (existingContact) {
        data.contact_id = existingContact.id;
        contactResult = {
          requested: true,
          created: false,
          duplicate: false,
          existing: true,
        };
      } else {
        const contactData = sanitizeData("contacts", {
          ...newContact,
          partner_id: data.partner_id,
          email: normalizedEmail,
        });
        const createdContact = await createTemuRecord({
          resource: "contacts",
          actor: session.user.email,
          data: contactData,
        });
        data.contact_source_external_id = contactData.source_external_id;
        contactResult = {
          requested: true,
          created: !createdContact.duplicate,
          duplicate: createdContact.duplicate,
          existing: false,
        };
      }
    }

    let result: TemuExportResult;
    const existingTouchpoint =
      body.resource === "touchpoints"
        ? await findExistingSourceRecord(
            "touchpoints",
            data.partner_id,
            data.source_external_id,
          )
        : null;
    if (existingTouchpoint) {
      result = {
        data: existingTouchpoint,
        duplicate: true,
        request_id: "existing-temu-record",
      };
    } else {
      try {
        result = await createTemuRecord({
          resource: body.resource,
          actor: session.user.email,
          data,
        });
      } catch (error) {
        if (contactResult && error instanceof TemuApiError) {
          return NextResponse.json(
            {
              error: `Contact handled, but the touchpoint failed: ${error.message}`,
              code: error.code,
              partial: { contact: contactResult },
            },
            { status: errorStatus(error) },
          );
        }
        throw error;
      }
    }

    if (body.follow_up_tasks === undefined) {
      return NextResponse.json(
        { ...result, contact: contactResult },
        { status: result.duplicate ? 200 : 201 },
      );
    }
    const taskResults: Array<{ duplicate: boolean }> = [];
    for (const rawTask of body.follow_up_tasks) {
      const ownership =
        rawTask.ownership === "partner" ? "partner" : "jaime";
      const existingTask = await findExistingSourceRecord(
        "follow_up_tasks",
        data.partner_id,
        String(rawTask.source_external_id),
      );
      if (existingTask) {
        taskResults.push({ duplicate: true });
        continue;
      }
      const touchpointId =
        typeof result.data.id === "string" ? result.data.id : undefined;
      const taskData = sanitizeData("follow-up-tasks", {
        partner_id: data.partner_id,
        source_external_id: rawTask.source_external_id,
        source_created_at: data.source_created_at,
        source_metadata: {
          parent_source_external_id: data.source_external_id,
          ownership,
        },
        touchpoint_id: touchpointId,
        touchpoint_source_external_id: touchpointId
          ? undefined
          : data.source_external_id,
        task: rawTask.task,
        due_date: rawTask.due_date ?? null,
        completed: false,
        status: ownership === "partner" ? "Waiting" : "Not Started",
        notes:
          typeof rawTask.owner === "string" && rawTask.owner.trim()
            ? `Owner identified by Leo: ${rawTask.owner.trim()}`
            : "Created from a reviewed TEMU touchpoint in Leo",
      });

      try {
        const taskResult = await createTemuRecord({
          resource: "follow-up-tasks",
          actor: session.user.email,
          data: taskData,
        });
        taskResults.push({ duplicate: taskResult.duplicate });
      } catch (error) {
        if (error instanceof TemuApiError) {
          return NextResponse.json(
            {
              error: `Touchpoint added, but a follow-up task failed: ${error.message}`,
              code: error.code,
              partial: {
                touchpoint_added: true,
                tasks_added: taskResults.length,
              },
            },
            { status: errorStatus(error) },
          );
        }
        throw error;
      }
    }

    return NextResponse.json(
      {
        ...result,
        contact: contactResult,
        follow_up_tasks: {
          requested: taskResults.length,
          created: taskResults.filter((task) => !task.duplicate).length,
          duplicates: taskResults.filter((task) => task.duplicate).length,
        },
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (error instanceof TemuApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: errorStatus(error) },
      );
    }
    console.error("TEMU export error", error);
    return NextResponse.json({ error: "TEMU export failed" }, { status: 500 });
  }
}
