// Stateful synthetic React transport; no browser, database, or external writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const flush = () => new Promise((resolve) => setImmediate(resolve));
const initial = { thread_id: "t", version: 1, message_id: "m", draft_message_id: "m", draft: "Original draft", notes: "", follow_up_on: null, status: "needs_input", in_inbox: true, subject: "Planning", draft_sources: [], updated_at: "2026-09-11T12:00:00Z" };
function harness() {
  let row = { ...initial }, cursor = 0;
  const slots = [], effects = [], intervals = [], requests = [], saves = [];
  const fetch = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? "GET", body: init.body && JSON.parse(init.body) });
    if (init.method === "PATCH") {
      const patch = JSON.parse(init.body);
      if (patch.version !== row.version) return Response.json({ error: "changed" }, { status: 409 });
      row = { ...row, ...patch, version: row.version + 1 };
    } else assert.equal(init.method, undefined, "this scenario must not send/archive/generate mail");
    return Response.json({ item: row });
  };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback, deps) { const i = cursor++; if (!sameDeps(slots[i]?.deps, deps)) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(callback, deps) { const i = cursor++; if (!sameDeps(slots[i]?.deps, deps)) { effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; }); } },
  };
  const helpers = moduleAt("src/lib/partner-response-editor.ts", { "./http": moduleAt("src/lib/http.ts") }, {}, "", { fetch });
  const mocks = {
    react, "react/jsx-runtime": jsx, "lucide-react": {}, "@/lib/http": moduleAt("src/lib/http.ts"),
    "@/types/partner-response": moduleAt("src/types/partner-response.ts"),
    "@/lib/partner-response-editor": helpers,
    "@/lib/partner-archive": moduleAt("src/lib/partner-archive.ts"),
    "@/lib/response-needed-policy": moduleAt("src/lib/response-needed-policy.ts"),
    "@/lib/partner-response-lane": moduleAt("src/lib/partner-response-lane.ts"),
    "@/lib/calendar-email": moduleAt("src/lib/calendar-email.ts"),
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/PartnerResponseQueue.tsx", "utf8") + "\nexport { ResponseEditor };", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require(id) { if (id in mocks) return mocks[id]; if (id.startsWith("./")) return { default: id }; throw new Error(`Unmocked dependency ${id}`); },
    fetch, Date, document: { visibilityState: "visible" },
    window: { confirm: () => true, setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
  });
  let tree;
  const render = () => { cursor = 0; tree = exports.ResponseEditor({ item: initial, policyReady: true, onBack() {}, onSaved(item) { saves.push(item); }, onSent() {} }); while (effects.length) effects.shift()(); return tree; };
  const all = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
  const text = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
  const button = (label) => all(tree).find((node) => node.type === "button" && text(node) === label);
  const textarea = (label) => all(tree).find((node) => node.type === "label" && text(node).startsWith(label))?.props.children.find((node) => node?.type === "textarea");
  return { render, button, textarea, text: () => text(tree), requests, saves, change(patch) { row = { ...row, ...patch, version: row.version + 1 }; }, async poll() { intervals[0](); await flush(); render(); }, row: () => row };
}
const h = harness();
h.render(); await flush(); h.render();
h.textarea("Notes / direction").props.onChange({ target: { value: "My unsaved notes" } }); h.render();
h.change({ reason: "New classification", status: "needs_response" }); await h.poll();
assert.equal(h.textarea("Notes / direction").props.value, "My unsaved notes");
assert.doesNotMatch(h.text(), /Review changed information/);
h.button("Save changes").props.onClick(); await flush(); h.render();
assert.equal(h.row().notes, "My unsaved notes");
assert.equal(h.row().status, "needs_response");
assert.equal(h.requests.filter((r) => r.method === "PATCH").length, 1);
h.textarea("Reply draft").props.onChange({ target: { value: "My new draft" } }); h.render();
h.change({ draft: "Remote new draft" }); await h.poll();
assert.match(h.text(), /Review changed information: Reply draft/);
assert.equal(h.button("Save changes").props.disabled, true);
assert.equal(h.textarea("Reply draft").props.value, "My new draft");
h.button("Reviewed latest; keep my edits").props.onClick(); h.render();
h.button("Save changes").props.onClick(); await flush(); h.render();
assert.equal(h.row().draft, "My new draft");
h.textarea("Notes / direction").props.onChange({ target: { value: "Still editing" } }); h.render();
h.change({ message_id: "new-email", draft: "", draft_message_id: null }); await h.poll();
assert.match(h.text(), /Review changed information: Latest email/);
assert.equal(h.textarea("Notes / direction").props.value, "Still editing");
h.button("Use saved version").props.onClick(); h.render();
assert.equal(h.textarea("Reply draft").props.value, "");
const review = harness();
review.render(); await flush(); review.render();
review.button("Review & send").props.onClick(); await flush(); review.render();
const readCount = review.requests.length;
review.change({ draft: "Another tab changed this" }); await review.poll();
assert.equal(review.requests.length, readCount, "send confirmation freezes the reviewed snapshot; send endpoint still verifies it");
console.log("Editor UI checks passed: polling during typing, safe save, conflict comparison/resolution, new mail, explicit discard, and frozen send confirmation.");
