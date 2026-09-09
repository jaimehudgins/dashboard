// Offline route, persistence-contract, and UI checks. No live services or model calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const env = { LEO_ALLOWED_EMAIL: "owner@example.org" };
const item = { thread_id: "abc", message_id: "m1", partner_id: "school", partner_name: "School" };
function harness({ email = env.LEO_ALLOWED_EMAIL, conversation = item, error = null } = {}) {
  const rows = [];
  let writes = 0;
  const route = moduleAt("src/app/api/partner-responses/rules/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "next-auth": { getServerSession: async () => email ? { user: { email } } : null },
    zod: { z }, "@/lib/auth": { authOptions: {} },
    "@/lib/partner-response-store": {
      getResponse: async (id) => id === "abc" ? conversation : null,
      responseDb: () => ({ from(table) {
        assert.equal(table, "partner_response_rules");
        const filters = [];
        let patch, insertion, single = false;
        return {
          select() { return this; },
          eq(key, value) { filters.push((r) => r[key] === value); return this; },
          is(key, value) { return this.eq(key, value); },
          insert(value) { insertion = value; return this; },
          update(value) { patch = value; return this; },
          single() { single = true; return this; },
          maybeSingle() { single = true; return this; },
          then(resolve) {
            if (error) return Promise.resolve(resolve({ data: null, error }));
            if (insertion) {
              if (rows.some((r) => r.id === insertion.id)) return Promise.resolve(resolve({ data: null, error: { code: "23505" } }));
              rows.push({ version: 1, ...insertion }); writes++;
            }
            const found = rows.filter((r) => filters.every((f) => f(r)) && (!insertion || r.id === insertion.id));
            if (patch) for (const row of found) { Object.assign(row, patch, { version: row.version + 1 }); writes++; }
            return Promise.resolve(resolve({ data: structuredClone(single ? found[0] ?? null : found), error: null }));
          },
        };
      } }),
    },
  }, env);
  return { route, rows, writes: () => writes };
}
const approval = { threadId: "abc", scope: "global", emailType: "meeting_acceptance", expectedVersion: null, decision: "no_reply", guidance: "Only if no questions or unresolved requests remain.", confirmed: true };
const request = (body, method = "POST") => new Request("https://leo.example/api/partner-responses/rules?threadId=abc", { method, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
for (const email of [null, "someone@example.org"]) {
  const h = harness({ email });
  assert.equal((await h.route.GET(request(null, "GET"))).status, 401);
  assert.equal((await h.route.POST(request(approval))).status, 401);
  assert.equal(h.writes(), 0);
}
let h = harness();
for (const patch of [{ confirmed: false }, { confirmed: undefined }, { guidance: " " }, { guidance: "x".repeat(801) }, { emailType: "arbitrary" }, { partner_id: "other" }, { expectedVersion: 0 }, { approved_by: "fake" }]) {
  assert.equal((await h.route.POST(request({ ...approval, ...patch }))).status, 400);
}
assert.equal(h.writes(), 0);
assert.equal((await h.route.POST(request({ ...approval, threadId: "missing" }))).status, 404);
assert.equal((await h.route.POST(request(approval))).status, 200);
assert.equal(h.rows[0].partner_id, null);
assert.equal(h.rows[0].approved_by, env.LEO_ALLOWED_EMAIL);
assert.equal(h.rows[0].version, 1);
assert.equal((await h.route.POST(request(approval))).status, 409, "duplicate create cannot replace an existing rule");
assert.equal((await h.route.POST(request({ ...approval, expectedVersion: 1, guidance: "Revised approved conditions" }))).status, 200);
assert.equal(h.rows[0].version, 2);
assert.equal((await h.route.POST(request({ ...approval, expectedVersion: 1 }))).status, 409, "stale edits cannot overwrite");
assert.equal((await h.route.POST(request({ ...approval, scope: "partner" }))).status, 200);
assert.equal(h.rows[1].partner_id, item.partner_id, "partner scope is derived from the saved conversation");
h.rows.push({ ...h.rows[1], id: "other:meeting_acceptance", partner_id: "other", guidance: "PRIVATE" });
const result = await (await h.route.GET(request(null, "GET"))).json();
assert.equal(result.rules.length, 2);
assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
const deactivate = { threadId: "abc", scope: "partner", emailType: "meeting_acceptance", expectedVersion: 1, confirmed: true };
assert.equal((await h.route.PATCH(request({ ...deactivate, confirmed: false }, "PATCH"))).status, 400);
assert.equal((await h.route.PATCH(request(deactivate, "PATCH"))).status, 200);
assert.equal(h.rows[1].active, false);
assert.equal(h.rows[1].version, 2);
assert.equal((await h.route.PATCH(request(deactivate, "PATCH"))).status, 409);
assert.equal((await h.route.POST(request({ ...approval, scope: "partner", expectedVersion: 2 }))).status, 200);
assert.equal(h.rows[1].active, true);
h = harness({ conversation: { ...item, partner_id: null } });
assert.equal((await h.route.POST(request({ ...approval, scope: "partner" }))).status, 400);
assert.equal(h.writes(), 0);
h = harness({ error: { code: "42P01" } });
assert.equal((await (await h.route.GET(request(null, "GET"))).json()).ready, false);
assert.equal((await h.route.POST(request(approval))).status, 503);
h = harness({ error: { code: "08006" } });
assert.equal((await h.route.GET(request(null, "GET"))).status, 503);

// Exercise real component handlers with a tiny hook/JSX harness, not a browser.
const policy = moduleAt("src/lib/response-needed-policy.ts");
let state = [], index = 0, calls = [];
const exports = {};
const jsx = (type, props) => ({ type, props });
const code = ts.transpileModule(fs.readFileSync("src/components/ResponseRulesPanel.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports, require(id) {
  if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
  if (id === "react") return { useEffect() {}, useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; }]; } };
  if (id === "@/lib/http") return { readJsonResponse: async (response) => response.json() };
  if (id === "@/lib/response-needed-policy") return policy;
  throw new Error(`Unexpected UI dependency ${id}`);
}, fetch: async (url, init) => { calls.push({ url, ...init }); return Response.json({ rule: { id: "approved" } }); }, Error, JSON });
function render(disabled = false) {
  index = 0;
  const tree = exports.default({ item, disabled });
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== "object") return; nodes.push(node); visit(node.props?.children); }
  visit(tree); return nodes;
}
render();
state[0] = { ready: true, rules: [] };
let nodes = render();
nodes.filter((n) => n.type === "select")[0].props.onChange({ target: { value: "meeting_acceptance" } });
nodes = render();
nodes.find((n) => n.type === "textarea").props.onChange({ target: { value: "PRIVATE partner detail" } });
nodes = render();
nodes.filter((n) => n.type === "select")[1].props.onChange({ target: { value: "global" } });
nodes = render();
assert.equal(nodes.find((n) => n.type === "textarea").props.value.includes("PRIVATE"), false, "global scope starts from generic guidance");
nodes.find((n) => n.type === "button" && n.props.children === "Review rule").props.onClick();
assert.equal(calls.length, 0, "review does not persist approval");
nodes = render(true);
const isApprove = (n) => n.type === "button" && String(n.props.children).startsWith("Approve for");
assert.equal(nodes.find(isApprove).props.disabled, true, "unsaved conversation edits disable approval");
nodes = render();
await nodes.find(isApprove).props.onClick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls.length, 1);
assert.equal(JSON.parse(calls[0].body).confirmed, true);
assert.equal(JSON.parse(calls[0].body).scope, "global");
assert.equal(JSON.parse(calls[0].body).guidance.includes("PRIVATE"), false);
const sql = fs.readFileSync("partner-response-rules.sql", "utf8");
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /FROM PUBLIC, anon, authenticated/);
assert.match(sql, /NEW.version := OLD.version \+ 1/);
assert.doesNotMatch(sql, /INSERT INTO/);
console.log("Reusable response rule checks passed: approval, isolation, version conflicts, disable/re-enable, setup, and UI review (offline).");
