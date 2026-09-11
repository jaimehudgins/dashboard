import type { PartnerResponse, ResponseStatus } from "@/types/partner-response";
import type { ResponseNeed } from "./response-needed-policy";
import { readJsonResponse } from "./http";

export interface ResponseForm {
  draft: string; notes: string; followUp: string; status: ResponseStatus;
  decision: ResponseNeed | ""; feedback: string;
}
export interface ResponseEditorState {
  base: PartnerResponse;
  form: ResponseForm;
  pending: PartnerResponse | null;
  conflicts: string[];
}
export function responseForm(item: PartnerResponse): ResponseForm {
  const correction = item.response_correction?.message_id === item.message_id ? item.response_correction : null;
  return { draft: item.draft, notes: item.notes, followUp: item.follow_up_on ?? "", status: item.status,
    decision: correction?.decision ?? "", feedback: correction?.reason ?? "" };
}
export function responseEditorState(item: PartnerResponse): ResponseEditorState {
  return { base: item, form: responseForm(item), pending: null, conflicts: [] };
}
export function responseFormDirty(state: ResponseEditorState): boolean {
  const base = responseForm(state.base);
  return (Object.keys(base) as (keyof ResponseForm)[]).some((key) => base[key] !== state.form[key]);
}

// Three-way merge: untouched fields follow the server; edits survive unrelated
// background writes. Decision and explanation form one atomic choice.
export function reconcileResponse(state: ResponseEditorState, latest: PartnerResponse, protectMessage = false): ResponseEditorState {
  if (latest.thread_id !== state.base.thread_id) throw new Error("Wrong conversation returned. Your edits are retained.");
  if (latest.version < state.base.version) return state;
  const before = responseForm(state.base), remote = responseForm(latest), form = { ...state.form };
  const conflicts: string[] = [];
  const groups: [string, (keyof ResponseForm)[]][] = [
    ["Reply draft", ["draft"]], ["Notes", ["notes"]], ["Follow-up date", ["followUp"]],
    ["Status", ["status"]], ["Your decision and explanation", ["decision", "feedback"]],
  ];
  for (const [label, keys] of groups) {
    const edited = keys.some((key) => state.form[key] !== before[key]);
    const changed = keys.some((key) => remote[key] !== before[key]);
    if (!edited) Object.assign(form, Object.fromEntries(keys.map((key) => [key, remote[key]])));
    else if (changed && keys.some((key) => state.form[key] !== remote[key])) conflicts.push(label);
  }
  if (latest.message_id !== state.base.message_id && (protectMessage || responseFormDirty(state) || state.conflicts.includes("Latest email"))) conflicts.unshift("Latest email");
  // Keep the original baseline until the user resolves a conflict; otherwise
  // a second poll could incorrectly treat the remote changes as already seen.
  return conflicts.length ? { ...state, pending: latest, conflicts }
    : { base: latest, form, pending: null, conflicts: [] };
}
export function keepResponseEdits(state: ResponseEditorState): ResponseEditorState {
  if (!state.pending) return state;
  const latest = state.pending, before = responseForm(state.base), form = responseForm(latest);
  for (const key of Object.keys(form) as (keyof ResponseForm)[]) {
    if (state.form[key] !== before[key]) Object.assign(form, { [key]: state.form[key] });
  }
  // Avoid mixing an explanation with a different remote decision.
  if (state.form.decision !== before.decision || state.form.feedback !== before.feedback) {
    form.decision = state.form.decision; form.feedback = state.form.feedback;
  }
  return { base: latest, form, pending: null, conflicts: [] };
}

export async function readCurrentResponse(threadId: string): Promise<PartnerResponse> {
  const response = await fetch(`/api/partner-responses?threadId=${encodeURIComponent(threadId)}&current=1`, { cache: "no-store" });
  const data = await readJsonResponse<{ item: PartnerResponse; error: string }>(response);
  if (!response.ok || !data.item || data.item.thread_id !== threadId || !Number.isInteger(data.item.version)) throw new Error(data.error || "Could not refresh this conversation. Your edits are retained.");
  return data.item;
}

export async function saveResponseEdits(initial: ResponseEditorState, policyReady: boolean, noFollowUp: boolean,
  onReconciled: (state: ResponseEditorState) => void): Promise<PartnerResponse | null> {
  let state = noFollowUp ? { ...initial, form: { ...initial.form, status: "handled" as const, followUp: "", ...(policyReady ? { decision: "no_reply" as const } : {}) } } : initial;
  // Only a rejected optimistic DB save can retry, once. Never retry network
  // ambiguity, email sending, archiving, or draft generation here.
  for (let attempt = 0; attempt < 2; attempt++) {
    state = reconcileResponse(state, await readCurrentResponse(state.base.thread_id), true);
    onReconciled(state);
    if (state.pending) return null;
    const { base, form } = state, before = responseForm(base);
    const correctionDirty = form.decision !== before.decision || form.feedback !== before.feedback;
    const savedStatus = noFollowUp ? "handled" : form.draft !== base.draft && form.status === base.status && !["waiting", "handled"].includes(form.status)
      ? form.draft.trim() ? "draft_ready" : "needs_response" : form.status;
    const patch = {
      threadId: base.thread_id, version: base.version,
      ...(form.notes !== base.notes ? { notes: form.notes } : {}),
      ...(savedStatus !== base.status ? { status: savedStatus } : {}),
      ...(form.followUp !== before.followUp || noFollowUp ? { follow_up_on: savedStatus === "handled" ? null : form.followUp || null } : {}),
      ...(form.draft !== base.draft ? { draft: form.draft, status: savedStatus } : {}),
      ...(policyReady && (noFollowUp || correctionDirty) ? { response_decision: noFollowUp ? "no_reply" : form.decision || undefined, response_feedback: form.feedback } : {}),
    };
    if (Object.keys(patch).length === 2) return base;
    const response = await fetch("/api/partner-responses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await readJsonResponse<{ item: PartnerResponse; error: string }>(response);
    if (response.status === 409 && attempt === 0) continue;
    if (!response.ok || !data.item) throw new Error(data.error || "Could not save. Your edits are retained; refresh the conversation before retrying.");
    return data.item;
  }
  return null;
}
