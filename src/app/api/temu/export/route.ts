import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  createTemuRecord,
  isTemuConfigured,
  isTemuResource,
  TemuApiError,
  TemuExportData,
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

    const result = await createTemuRecord({
      resource: body.resource,
      actor: session.user.email,
      data: sanitizeData(body.resource, body.data),
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (error instanceof TemuApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      );
    }
    console.error("TEMU export error", error);
    return NextResponse.json({ error: "TEMU export failed" }, { status: 500 });
  }
}
