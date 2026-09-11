// Stateful component checks with synthetic transport; no external writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";
const slots = [], effects = [], requests = [];
let cursor = 0, tree, fail = false, linked = [], editing = false;
const react = {
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
  useRef(initial) { return slots[cursor++] ??= { current: initial }; },
  useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
  useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
};
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
const preview = { messageId: "m1", title: "Add staff", notes: "Email excerpt: Add Ana", links: ["https://docs.google.com/document/d/example"] };
const fetch = async (url, options = {}) => {
  requests.push({ url, ...options });
  if (options.method === "POST") {
    if (fail) return Response.json({ error: "Temporary failure; edits retained" }, { status: 500 });
    const input = JSON.parse(options.body);
    linked = [{ id: "task1", title: input.title, status: "pending", due_date: null }];
    return Response.json({ task: linked[0], existing: false });
  }
  return Response.json({ tasks: linked, ...(url.includes("preview=1") ? { preview } : {}) });
};
const exports = {};
const mocks = { react, "react/jsx-runtime": jsx, "@/lib/http": moduleAt("src/lib/http.ts"), "@/lib/email-task": moduleAt("src/lib/email-task.ts") };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/AttentionEmailTasks.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require(id) { assert.ok(id in mocks, id); return mocks[id]; }, fetch, window: { confirm: () => true, addEventListener() {}, removeEventListener() {} } });
const onEditingChange = (value) => { editing = value; };
function render() { cursor = 0; tree = exports.default({ threadId: "abc123", onEditingChange }); while (effects.length) effects.shift()(); }
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); render(); };
const all = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const text = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
const button = (label) => all(tree).find((node) => node.type === "button" && text(node) === label);
const field = (type) => all(tree).find((node) => node.type === type);
render(); await flush();
assert.ok(button("Create task")); assert.equal(editing, false);
button("Create task").props.onClick(); await flush();
assert.equal(editing, true); assert.equal(field("textarea").props.value, preview.notes);
field("textarea").props.onChange({ target: { value: "My specific task notes" } }); render();
const check = all(tree).find((node) => node.type === "input" && node.props.type === "checkbox");
check.props.onChange({ target: { checked: true } }); render();
fail = true;
button("Confirm and create task").props.onClick(); await flush();
assert.equal(field("textarea").props.value, "My specific task notes"); assert.equal(editing, true);
assert.match(text(tree), /Temporary failure/);
fail = false;
const create = button("Confirm and create task").props.onClick;
create(); create(); await flush();
assert.equal(requests.filter((request) => request.method === "POST").length, 2, "failed attempt plus one confirmed retry; double click cannot duplicate");
const sent = JSON.parse(requests.filter((request) => request.method === "POST").at(-1).body);
assert.equal(sent.notes, "My specific task notes"); assert.deepEqual(sent.links, preview.links); assert.equal(sent.confirmed, true);
assert.equal(editing, false); assert.equal(field("textarea"), undefined);
assert.match(text(tree), /response status is unchanged/);
assert.equal(all(tree).find((node) => node.type === "a" && node.props.href === "/work?task=task1").props.target, "_blank");
linked[0].status = "completed";
button("Refresh linked tasks").props.onClick(); await flush(); assert.match(text(tree), /completed/);
button("Create task").props.onClick(); await flush(); assert.equal(button("Confirm and create task").props.disabled, true);
button("Cancel task").props.onClick(); render(); assert.equal(editing, false);
console.log("Attention task UI passed: review/edit, link selection, retained text on failure, duplicate-click guard, confirmed save, Work link, completed tasks, and cancel.");
