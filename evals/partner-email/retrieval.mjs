import { moduleLoader } from "./offline-runtime.mjs";
import { Buffer } from "node:buffer";

const doc = (id, name, text, extra = {}) => ({ id, name, text, mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-09-08T12:00:00Z", webViewLink: `https://docs.google.com/document/d/${id}/edit`, ...extra });
const context = () => ({ partner: { id: "cedar", name: "Cedar Ridge", status: "active", summary: "Two reviewers requested." }, assembledAt: "2026-09-08T14:00:00Z", contacts: [], openFollowUps: [], importantDates: [], recentTouchpoints: [], memories: [], relevantEmails: [], recentMeetings: [{ date: "2026-09-07", title: "Cedar implementation", summary: "Ana and Ben will review ALMA flags." }] });
const message = (body, subject = "Question") => ({ from: "maya@cedar.example", subject, body, snippet: body.slice(0, 100) });
export const retrievalCases = [
  { id: "R01", title: "Find and read a relevant Drive document", messages: [message("Please send the Cedar onboarding resource.", "Cedar onboarding")], corpus: [doc("cedar", "Cedar onboarding resource", "Cedar checklist: confirm reviewers, then staff setup.")], required: ["drive:cedar"], content: ["confirm reviewers"], forbidden: [] },
  { id: "R02", title: "Retrieve a request from earlier in the conversation", messages: [message("Please send the Spanish family resource."), message("Thanks for the teacher guide!")], corpus: [doc("spanish", "Spanish family resource", "Spanish sheet: EVAL_SPANISH")], required: ["drive:spanish"], content: ["EVAL_SPANISH"], forbidden: [] },
  { id: "R03", title: "Read an explicit Google link by its file ID", messages: [message("Can you check this? https://docs.google.com/document/d/linked/edit")], corpus: [doc("linked", "Family handout", "EVAL_LINK_CONTENT")], required: ["drive:linked"], content: ["EVAL_LINK_CONTENT"], forbidden: [] },
  { id: "R04", title: "Do not provide another partner's confidential document", messages: [message("Please send Cedar's onboarding resource.", "Cedar onboarding")], corpus: [doc("cedar", "Cedar onboarding", "Cedar checklist"), doc("other", "Onboarding resource - Other School PRIVATE", "OTHER_PARTNER_CONFIDENTIAL: contract rates", { partner: "Other School" })], required: ["drive:cedar"], content: [], forbidden: ["drive:other"] },
  { id: "R05", title: "Do not substitute an unreadable document's title for content", messages: [message("Please send the onboarding resource.")], corpus: [doc("denied", "Onboarding resource", "SECRET_UNREAD", { unreadable: true })], required: [], content: [], forbidden: ["drive:denied"] },
  { id: "R06", title: "Keep CRM/Granola context when a Drive body fetch fails", messages: [message("Please review the Cedar implementation resource.")], context: context(), corpus: [doc("broken", "Cedar implementation resource", "", { failRead: true })], required: ["crm:cedar", "granola:cedar"], content: ["Ana and Ben"], forbidden: [] },
  { id: "R07", title: "Carry CRM and Granola meeting content into evidence", messages: [message("What did we agree about the reviewers?")], context: context(), corpus: [], required: ["crm:cedar", "granola:cedar"], content: ["Ana and Ben"], forbidden: [] },
  { id: "R08", title: "Canonical document survives recently modified archived copies", messages: [message("Please send the Cedar onboarding resource.", "Cedar onboarding")], corpus: [...Array.from({ length: 5 }, (_, i) => doc(`old${i}`, `Cedar onboarding resource ARCHIVED ${i}`, "Obsolete 2024 content; file moved to archive today.")), doc("canonical", "Cedar onboarding resource CURRENT", "CANONICAL_CHECKLIST", { modifiedTime: "2026-09-07T12:00:00Z" })], required: ["drive:canonical"], content: ["CANONICAL_CHECKLIST"], forbidden: [] },
];

export async function evaluateRetrieval(testCase, snapshot = null) {
  const moduleAt = moduleLoader(snapshot);
  const trace = { queries: [], reads: [], partnerRequests: [] };
  const drive = moduleAt("src/lib/drive.ts", { "node:buffer": { Buffer }, fflate: {} }, {}, "", {
    fetch: async (url, options = {}) => {
      if (options.method && options.method !== "GET") throw new Error("External write blocked");
      const parsed = new URL(url);
      if (parsed.origin !== "https://www.googleapis.com") throw new Error("Unexpected endpoint");
      if (parsed.pathname === "/drive/v3/files") {
        const query = (parsed.searchParams.get("q").match(/name contains '((?:\\'|[^'])*)'/)?.[1] ?? "").replace(/\\'/g, "'").toLowerCase();
        trace.queries.push(query);
        const files = testCase.corpus.filter((d) => `${d.name}\n${d.text}`.toLowerCase().includes(query))
          .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
          .slice(0, Number(parsed.searchParams.get("pageSize")));
        return Response.json({ files: files.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, modifiedTime: d.modifiedTime, webViewLink: d.webViewLink })) });
      }
      const id = parsed.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/export$/)?.[1];
      if (!id) throw new Error(`Unsupported synthetic request ${parsed.pathname}`);
      trace.reads.push(id);
      const found = testCase.corpus.find((d) => d.id === id);
      return new Response(found?.text ?? "", { status: !found ? 404 : found.unreadable ? 403 : found.failRead ? 503 : 200 });
    },
  });
  const lib = moduleAt("src/lib/reply-sources.ts", {
    "./drive": drive,
    "./partner-context": { getPartnerContextForEmail: async (request) => { trace.partnerRequests.push(request); return testCase.context ?? null; } },
    "./platform-knowledge": { findPlatformKnowledge: () => [] },
  });
  let sources = [];
  let error;
  try { sources = await lib.gatherReplySources("synthetic", { id: testCase.id, messages: testCase.messages }); }
  catch (failure) { error = failure.message; }
  const ids = sources.map((s) => s.id);
  const text = sources.map((s) => s.content).join("\n");
  const checks = {
    noRetrievalCrash: !error,
    requiredSources: testCase.required.every((id) => ids.includes(id)),
    bodyEvidence: testCase.content.every((value) => text.includes(value)),
    noWrongOrUnreadableSource: testCase.forbidden.every((id) => !ids.includes(id)),
  };
  return { id: testCase.id, title: testCase.title, passed: Object.values(checks).every(Boolean), checks, sourceIds: ids, trace, ...(error ? { error } : {}) };
}
