import "server-only";

import { randomUUID } from "node:crypto";

export const TEMU_RESOURCES = [
  "contacts",
  "attachments",
  "touchpoints",
  "follow-up-tasks",
] as const;

export type TemuResource = (typeof TEMU_RESOURCES)[number];

export type TemuExportData = Record<string, unknown> & {
  partner_id: string;
  source_external_id: string;
  source_created_at?: string | null;
  source_metadata?: Record<string, unknown>;
};

export interface TemuExportResult {
  data: Record<string, unknown>;
  duplicate: boolean;
  request_id: string;
}

export class TemuApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "TemuApiError";
  }
}

export function isTemuConfigured(): boolean {
  return Boolean(
    process.env.TEMU_API_BASE_URL?.trim() &&
      process.env.TEMU_API_KEY?.trim(),
  );
}

export function isTemuResource(value: string): value is TemuResource {
  return (TEMU_RESOURCES as readonly string[]).includes(value);
}

export async function createTemuRecord(input: {
  resource: TemuResource;
  actor: string;
  data: TemuExportData;
}): Promise<TemuExportResult> {
  const baseUrl = process.env.TEMU_API_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.TEMU_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new TemuApiError("TEMU export is not configured", 503);
  }

  const requestId = randomUUID();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${input.resource}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({
        ...input.data,
        source_actor: input.actor,
      }),
      cache: "no-store",
    });
  } catch {
    throw new TemuApiError("TEMU could not be reached", 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TemuApiError(
      `TEMU returned an invalid response (${response.status})`,
      502,
    );
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } })
      ?.error;
    throw new TemuApiError(
      error?.message || `TEMU export failed (${response.status})`,
      response.status,
      error?.code,
    );
  }

  return payload as TemuExportResult;
}
