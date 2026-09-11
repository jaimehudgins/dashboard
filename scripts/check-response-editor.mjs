// Offline only: synthetic fetches, no Gmail/model/database writes.
import assert from "node:assert/strict";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const http = moduleAt("src/lib/http.ts");
const base = { thread_id: "thread", message_id: "message", version: 1, notes: "Old notes", draft: "Old draft", draft_message_id: "message", status: "needs_input", follow_up_on: null };
const helpers = moduleAt("src/lib/partner-response-editor.ts", { "./http": http });
const { responseEditorState: state, reconcileResponse: merge, keepResponseEdits: keep, responseFormDirty: dirty } = helpers;
const edit = (form) => ({ ...state(base), form: { ...state(base).form, ...form } });
const latest = (patch) => ({ ...base, version: 2, ...patch });
assert.equal(dirty(state(base)), false);
assert.equal(dirty(edit({ notes: "My notes" })), true);
const bookkeeping = latest({ in_inbox: false, reason: "Updated", response_assessment: { message_id: "message", decision: "action_only" } });
const rebased = merge(edit({ notes: "My notes" }), bookkeeping);
assert.equal(rebased.pending, null);
assert.equal(rebased.base.version, 2);
assert.equal(rebased.form.notes, "My notes");
assert.equal(rebased.base.in_inbox, false);
assert.equal(merge(state(base), latest({ notes: "Remote notes", draft: "Remote draft", status: "draft_ready" })).form.draft, "Remote draft", "untouched editor follows server");
assert.equal(merge(edit({ draft: "My draft" }), latest({ notes: "Remote notes" })).form.notes, "Remote notes");
assert.equal(merge(edit({ notes: "Same edit" }), latest({ notes: "Same edit" })).pending, null, "identical edits are compatible");
for (const [field, remoteField, local, remote] of [
  ["notes", "notes", "My notes", "Remote notes"], ["draft", "draft", "My draft", "Remote draft"],
  ["status", "status", "waiting", "handled"], ["followUp", "follow_up_on", "2026-09-20", "2026-09-21"],
]) {
  const conflict = merge(edit({ [field]: local }), latest({ [remoteField]: remote }));
  assert.ok(conflict.pending);
  assert.equal(conflict.form[field], local);
  assert.equal(conflict.base.version, 1, "keep original baseline until conflict is resolved");
  assert.ok(merge(conflict, latest({ [remoteField]: remote })).pending, "repeat poll cannot erase a conflict");
  assert.equal(keep(conflict).form[field], local);
  assert.equal(keep(conflict).base.version, 2);
}
const correction = { message_id: "message", decision: "waiting", reason: "Remote explanation" };
const decisionConflict = merge(edit({ decision: "action_only", feedback: "My explanation" }), latest({ response_correction: correction }));
assert.ok(decisionConflict.pending);
assert.equal(keep(decisionConflict).form.feedback, "My explanation");
assert.equal(keep(decisionConflict).form.decision, "action_only");
const newMessage = latest({ message_id: "new", draft: "", draft_message_id: null });
assert.equal(merge(state(base), newMessage).base.message_id, "new", "clean editor follows new mail");
const incomingConflict = merge(edit({ notes: "Keep me" }), newMessage);
assert.ok(incomingConflict.conflicts.includes("Latest email"));
assert.equal(keep(incomingConflict).form.notes, "Keep me");
assert.equal(keep(incomingConflict).form.draft, "", "sent/retired remote draft is not resurrected");
const actionConflict = merge(state(base), newMessage, true);
assert.ok(actionConflict.pending, "a new message arriving during a click must be reviewed even in an untouched editor");
assert.ok(merge(actionConflict, newMessage).pending, "background poll cannot dismiss the action's new-message warning");
assert.equal(merge(rebased, base).base.version, 2, "late old responses cannot roll back the editor");
assert.throws(() => merge(state(base), latest({ thread_id: "other" })), /Wrong conversation/);

async function runSave(options = {}) {
  const requests = [], snapshots = [];
  let gets = 0, patches = 0;
  const api = moduleAt("src/lib/partner-response-editor.ts", { "./http": http }, {}, "", {
    fetch: async (url, init = {}) => {
      requests.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
      if (!init.method) {
        gets++;
        if (options.readFails) return Response.json({ error: "Read failed" }, { status: 503 });
        return Response.json({ item: options.latest?.[Math.min(gets - 1, options.latest.length - 1)] ?? bookkeeping });
      }
      assert.equal(init.method, "PATCH", "helper must never send/archive/generate a reply");
      patches++;
      if (options.networkFails) throw new Error("Connection lost");
      if (options.conflictAlways || (options.conflictOnce && patches === 1)) return Response.json({ error: "Response changed" }, { status: 409 });
      return Response.json({ item: { ...bookkeeping, ...JSON.parse(init.body), version: 9 } });
    },
  });
  let result, error;
  try { result = await api.saveResponseEdits(options.initial ?? edit({ notes: "My notes" }), true, options.close ?? false, (snapshot) => snapshots.push(snapshot)); }
  catch (caught) { error = caught; }
  return { requests, snapshots, result, error, gets, patches };
}
const saved = await runSave();
assert.equal(saved.error, undefined);
assert.equal(saved.requests[1].body.version, 2);
assert.deepEqual(saved.requests[1].body, { threadId: "thread", version: 2, notes: "My notes" }, "save only edited fields; preserve remote status/draft/corrections");
const noop = await runSave({ initial: state(base) });
assert.equal(noop.patches, 0);
const retried = await runSave({ conflictOnce: true, latest: [bookkeeping, { ...bookkeeping, version: 3 }] });
assert.equal(retried.patches, 2);
assert.equal(retried.requests.at(-1).body.version, 3);
const race = await runSave({ conflictOnce: true, latest: [bookkeeping, latest({ version: 3, notes: "Other human edit" })] });
assert.equal(race.patches, 1);
assert.equal(race.result, null);
assert.ok(race.snapshots.at(-1).pending);
const retryLimit = await runSave({ conflictAlways: true });
assert.equal(retryLimit.patches, 2);
assert.ok(retryLimit.error);
const network = await runSave({ networkFails: true });
assert.equal(network.patches, 1, "unknown write result is never retried");
assert.ok(network.error);
assert.equal((await runSave({ readFails: true })).patches, 0);
const changedMessage = await runSave({ latest: [newMessage] });
assert.equal(changedMessage.patches, 0);
assert.equal(changedMessage.result, null);
const closed = await runSave({ close: true, initial: state(base) });
assert.equal(closed.requests.at(-1).body.response_decision, "no_reply");
assert.equal(closed.requests.at(-1).body.status, "handled");
assert.equal(closed.requests.at(-1).body.follow_up_on, null);
assert.equal((await runSave({ close: true, initial: state(base), latest: [newMessage] })).patches, 0);
console.log("Editor checks passed: three-way merging, preserved edits, conflicts, new messages, old reads, minimal patches, bounded DB retries, and no retry after unknown writes.");
