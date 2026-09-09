"use client";

import { useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/http";
import { RESPONSE_CHOICES, RESPONSE_EMAIL_TYPES, type ResponseEmailType, type ResponseNeed, type ResponseRule } from "@/lib/response-needed-policy";
import type { PartnerResponse } from "@/types/partner-response";

interface RulesResult { ready: boolean; rules: ResponseRule[]; error?: string }
interface Proposal { emailType: ResponseEmailType; scope: "global" | "partner"; decision: ResponseNeed; guidance: string; expectedVersion: number | null }

export default function ResponseRulesPanel({ item, disabled }: { item: PartnerResponse; disabled: boolean }) {
  const [result, setResult] = useState<RulesResult | null>(null);
  const [reload, setReload] = useState(0);
  const [type, setType] = useState<ResponseEmailType | "">("");
  const [scope, setScope] = useState<"global" | "partner">(item.partner_id ? "partner" : "global");
  const [decision, setDecision] = useState<ResponseNeed>("no_reply");
  const [guidance, setGuidance] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/partner-responses/rules?threadId=${encodeURIComponent(item.thread_id)}`, { cache: "no-store", signal: controller.signal });
        const body = await readJsonResponse<RulesResult>(response);
        if (!response.ok || typeof body.ready !== "boolean" || !Array.isArray(body.rules)) throw new Error(body.error || "Could not load rules.");
        if (!controller.signal.aborted) setResult({ ready: body.ready, rules: body.rules, error: body.error });
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load rules.");
      }
    }
    void load();
    return () => controller.abort();
  }, [item.thread_id, reload]);
  const frozen = disabled || busy;
  const currentCorrection = item.response_correction?.message_id === item.message_id ? item.response_correction : null;
  const scopeLabel = (value: "global" | "partner") => value === "global" ? "All partners" : item.partner_name;
  const existing = result?.rules.find((rule) => rule.email_type === type && rule.partner_id === (scope === "global" ? null : item.partner_id));

  const refresh = () => { setResult(null); setProposal(null); setError(null); setReload((value) => value + 1); };
  const approve = async () => {
    if (!proposal || frozen) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: item.thread_id, ...proposal, confirmed: true }) });
      const body = await readJsonResponse<{ rule: ResponseRule; error: string }>(response);
      if (!response.ok || !body.rule) throw new Error(body.error || "Rule was not saved. Refresh rules and review again.");
      setNotice(`Rule approved for ${scopeLabel(proposal.scope)}. It will guide future assessments; existing decisions are unchanged.`);
      refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not approve rule."); }
    finally { setBusy(false); }
  };
  const deactivate = async (rule: ResponseRule) => {
    if (frozen || !window.confirm(`Disable this rule for ${rule.partner_id ? item.partner_name : "all partners"}? A disabled partner exception falls back to any active general rule.`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses/rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: item.thread_id, scope: rule.partner_id ? "partner" : "global", emailType: rule.email_type, expectedVersion: rule.version, confirmed: true }) });
      const body = await readJsonResponse<{ rule: ResponseRule; error: string }>(response);
      if (!response.ok || !body.rule) throw new Error(body.error || "Could not disable rule.");
      setNotice("Rule disabled. Existing conversation decisions are unchanged."); refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not disable rule."); }
    finally { setBusy(false); }
  };

  return <details className="rounded-xl border border-emerald-100 p-4">
    <summary className="cursor-pointer font-semibold text-emerald-900">Email-type rules &amp; partner exceptions</summary>
    <div className="mt-4 space-y-4 text-sm">
      <p className="text-slate-600">Corrections are examples. Reusable rules require your explicit approval here. Rules guide suggestions; they do not send emails, accept invitations, create tasks, or automatically close conversations.</p>
      {notice && <p role="status" className="text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-amber-800">{error}</p>}
      <button type="button" disabled={busy} onClick={refresh} className="text-xs font-semibold text-emerald-800 underline">Refresh rules</button>
      {!result && !error && <p>Loading rules…</p>}
      {result && !result.ready && <p className="text-amber-800">{result.error} Existing corrections still work.</p>}
      {result?.ready && <>
        <div className="space-y-2">
          {result.rules.length === 0 && <p className="text-slate-500">No reusable rules approved yet.</p>}
          {result.rules.map((rule) => <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
            <p className="font-medium">{RESPONSE_EMAIL_TYPES.find(([key]) => key === rule.email_type)?.[1]} · {rule.partner_id ? item.partner_name : "All partners"} · {rule.active ? "Active" : "Disabled"}</p>
            <p className="mt-1 text-xs text-slate-500">{RESPONSE_CHOICES.find(([key]) => key === rule.decision)?.[1]} · Version {rule.version}{rule.partner_id && rule.active ? " · Overrides the general rule for this type" : ""}</p>
            <p className="my-2 whitespace-pre-wrap">{rule.guidance}</p>
            <button type="button" disabled={frozen} onClick={() => { setType(rule.email_type); setScope(rule.partner_id ? "partner" : "global"); setDecision(rule.decision); setGuidance(rule.guidance); setProposal(null); }} className="mr-4 text-xs font-semibold text-emerald-800 underline">{rule.active ? "Edit rule" : "Review to re-enable"}</button>
            {rule.active && <button type="button" disabled={frozen} onClick={() => void deactivate(rule)} className="text-xs text-slate-500 underline">Disable</button>}
          </div>)}
        </div>
        {disabled && <p className="text-amber-800">Save your conversation edits before approving or changing reusable rules.</p>}
        <fieldset disabled={frozen} className="space-y-3 border-t border-slate-100 pt-4 disabled:opacity-60">
          <legend className="font-semibold">Propose a reusable rule</legend>
          <label className="block">Email type<select value={type} onChange={(event) => {
            const next = event.target.value as ResponseEmailType; setType(next); setProposal(null);
            setGuidance(RESPONSE_EMAIL_TYPES.find(([key]) => key === next)?.[2] ?? "");
            setDecision(currentCorrection?.decision ?? (next === "calendar_invitation" ? "action_only" : next === "meeting_change" || next === "platform_access" ? "judgment" : next === "curriculum_question" ? "reply_needed" : "no_reply"));
          }} className="ml-2 rounded-lg border border-slate-200 p-2"><option value="" disabled>Choose an email type</option>{RESPONSE_EMAIL_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="block">Applies to<select value={scope} onChange={(event) => { setScope(event.target.value as "global" | "partner"); setProposal(null); if (event.target.value === "global") setGuidance(RESPONSE_EMAIL_TYPES.find(([key]) => key === type)?.[2] ?? ""); }} className="ml-2 rounded-lg border border-slate-200 p-2"><option value="partner" disabled={!item.partner_id}>Only {item.partner_name || "this partner"}</option><option value="global">All partners</option></select></label>
          {scope === "global" && <p className="text-xs text-amber-800">This affects every partner. Use general guidance only—no partner names, contacts, or private details. Partner exceptions still take precedence.</p>}
          <label className="block">Default decision<select value={decision} onChange={(event) => { setDecision(event.target.value as ResponseNeed); setProposal(null); }} className="ml-2 rounded-lg border border-slate-200 p-2">{RESPONSE_CHOICES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="block">Conditions and exceptions<textarea value={guidance} maxLength={800} rows={4} onChange={(event) => { setGuidance(event.target.value); setProposal(null); }} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
          <p className="text-xs text-slate-500">A meeting acceptance with a new question or an earlier unresolved request still needs attention. These templates are proposals, not active rules.</p>
          <button type="button" disabled={!type || !guidance.trim()} onClick={() => { if (type) setProposal({ emailType: type, scope, decision, guidance: guidance.trim(), expectedVersion: existing?.version ?? null }); }} className="rounded-lg border border-emerald-200 px-3 py-2 font-semibold text-emerald-800">Review rule</button>
        </fieldset>
        {proposal && <section aria-label="Approve reusable rule" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold">{proposal.expectedVersion ? "Replace existing rule" : "Create rule"} · {scopeLabel(proposal.scope)}</p>
          <p>{RESPONSE_EMAIL_TYPES.find(([key]) => key === proposal.emailType)?.[1]} → {RESPONSE_CHOICES.find(([key]) => key === proposal.decision)?.[1]}</p>
          <p className="whitespace-pre-wrap">{proposal.guidance}</p>
          <button type="button" disabled={frozen} onClick={() => void approve()} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : `Approve for ${scopeLabel(proposal.scope)}`}</button>
          <button type="button" disabled={busy} onClick={() => setProposal(null)} className="ml-3 underline">Cancel</button>
        </section>}
      </>}
    </div>
  </details>;
}
