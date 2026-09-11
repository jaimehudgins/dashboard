// Stateful React checks with a synthetic transport; no live data or writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const requests = [];
let fail = false;
let view = { file: { id: "f1", name: "Pilot" }, canWrite: true, writeReason: "", comments: [{ id: "c1", content: "Please update this", replies: [], revision: "a".repeat(64), status: "review", task: null, pendingWrite: false }] };
const setup = { files: [view.file], pickerReady: true, permissionReady: true, enabled: true };
const fetch = async (url, options = {}) => {
  requests.push({ url, ...options });
  if (options.method === "POST") return fail ? Response.json({ error: "Uncertain write. Text retained." }, { status: 409 }) : Response.json({ sent: true });
  return Response.json(url.includes("fileId=") ? view : setup);
};
let active;
const react = {
  useState(initial) { const context = active, i = context.cursor++; if (!(i in context.slots)) context.slots[i] = initial; return [context.slots[i], (value) => { context.slots[i] = typeof value === "function" ? value(context.slots[i]) : value; }]; },
  useRef(initial) { const i = active.cursor++; return active.slots[i] ??= { current: initial }; },
  useCallback(fn) { active.cursor++; return fn; },
  useEffect(fn) { const context = active, i = context.cursor++; if (!(i in context.slots)) { context.slots[i] = true; context.effects.push(fn); } },
};
const exports = {};
const mocks = { react, "react/jsx-runtime": jsx, "next-auth/react": { signIn() {} }, "lucide-react": { ExternalLink: () => null, MessageSquareText: () => null, RefreshCw: () => null }, "@/lib/google-comment-picker": { chooseCommentFile: async () => null } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/DriveCommentQueue.tsx", "utf8") + "\nexport { CommentItem };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require(id) { assert.ok(id in mocks, id); return mocks[id]; }, fetch, URL, Set, Error });
const all = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const text = (node) => node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
function harness(component, props) {
  const context = { slots: [], cursor: 0, effects: [], tree: null, props };
  context.render = () => { active = context; context.cursor = 0; context.tree = component(context.props); while (context.effects.length) context.effects.shift()(); };
  context.button = (label) => all(context.tree).find((node) => node.type === "button" && text(node).trim() === label);
  context.field = (type) => all(context.tree).find((node) => node.type === type);
  context.flush = async () => { await new Promise((resolve) => setImmediate(resolve)); context.render(); };
  context.render();
  return context;
}
let editing = false;
const card = harness(exports.CommentItem, { comment: view.comments[0], view, refresh: async () => {}, editing: (_id, open) => { editing = open; } });
card.button("Reply in Drive").props.onClick(); card.render();
assert.equal(editing, true);
card.field("textarea").props.onChange({ target: { value: "My reviewed reply" } }); card.render();
assert.equal(requests.length, 0, "typing/opening does not write");
card.button("Review reply").props.onClick(); card.render();
assert.equal(requests.length, 0, "review does not send");
assert.equal(card.field("textarea").props.disabled, true);
fail = true;
await card.button("Confirm and post reply").props.onClick(); card.render();
assert.equal(card.field("textarea").props.value, "My reviewed reply");
assert.match(text(card.tree), /Uncertain write/);
card.props = { ...card.props, comment: { ...card.props.comment, revision: "b".repeat(64) } }; card.render();
assert.equal(card.button("Confirm and post reply").props.disabled, true);
card.button("I reviewed the refreshed comment").props.onClick(); card.render();
assert.equal(card.field("textarea").props.value, "My reviewed reply");
card.button("Review reply").props.onClick(); card.render();
fail = false;
const send = card.button("Confirm and post reply").props.onClick;
await Promise.all([send(), send()]); card.render();
assert.equal(requests.length, 2, "one failed send plus one successful send, no duplicate click");
const payload = JSON.parse(requests.at(-1).body);
assert.equal(payload.confirmed, true); assert.equal(payload.revision, "b".repeat(64));
assert.equal(payload.content, "My reviewed reply"); assert.equal(editing, false);
assert.match(text(card.tree), /Reply sent to Drive/);
await card.button("No action needed").props.onClick(); card.render();
assert.equal(JSON.parse(requests.at(-1).body).action, "triage", "No action is not a resolution");
card.button("Resolve in Drive").props.onClick(); card.render();
const before = requests.length;
assert.match(text(card.tree), /does not complete a task/);
assert.equal(requests.length, before);
await card.button("Confirm resolve in Drive").props.onClick(); card.render();
assert.equal(JSON.parse(requests.at(-1).body).action, "resolve");
card.props = { ...card.props, view: { ...view, canWrite: false } }; card.render();
assert.equal(card.button("Reply in Drive").props.disabled, true);
assert.equal(card.button("Resolve in Drive").props.disabled, true);
assert.equal(card.button("Create task").props.disabled, false, "tasks do not need Drive write permission");
card.button("Create task").props.onClick(); card.render();
card.field("input").props.onChange({ target: { value: "Update the lesson" } }); card.render();
await card.button("Confirm and create task").props.onClick(); card.render();
assert.equal(JSON.parse(requests.at(-1).body).action, "task");
card.props = { ...card.props, comment: { ...card.props.comment, task: { id: "task1", title: "Update lesson", status: "completed" } } }; card.render();
assert.equal(card.button("Create task"), undefined);
assert.ok(all(card.tree).some((node) => node.type === "a" && node.props.href === "/work?task=task1"));

const queue = harness(exports.default, {});
await queue.flush();
queue.field("select").props.onChange({ target: { value: "f1" } }); await queue.flush();
const item = () => all(queue.tree).find((node) => node.type === exports.CommentItem);
assert.ok(item());
item().props.editing("c1", true); queue.render();
assert.equal(queue.field("select").props.disabled, true, "switching files cannot discard an open editor");
view = { ...view, comments: [{ ...view.comments[0], resolved: true }] };
await queue.button("Refresh comments").props.onClick(); await queue.flush();
assert.equal(item().props.comment.resolved, true, "refresh keeps resolved comments with an unsent editor mounted");
view = { ...view, comments: [] };
await queue.button("Refresh comments").props.onClick(); await queue.flush();
assert.equal(item().props.comment.deleted, true, "missing comments retain a disabled editor and unsent text");
console.log("Drive comment UI passed: explicit reply/resolve confirmation, local-only triage, retained drafts, stale-review acknowledgement, duplicate-click guard, permissions, linked tasks, and editor retention during refresh.");
