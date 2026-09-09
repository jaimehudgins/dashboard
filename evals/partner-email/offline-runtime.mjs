import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

export const root = path.resolve(import.meta.dirname, "../..");
export function moduleAt(file, mocks = {}, env = {}, suffix = "", globals = {}, snapshot = null) {
  const exports = {};
  if (snapshot && typeof snapshot[file] !== "string") throw new Error(`Frozen source missing: ${file}`);
  const source = snapshot ? snapshot[file] : fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require(id) {
    if (id === "server-only") return {};
    if (Object.hasOwn(mocks, id)) return mocks[id];
    throw new Error(`Unmocked dependency blocked: ${id}`);
  }, Date, Set, Map, Error, SyntaxError, URL, Request, Response, URLSearchParams,
  console: { warn() {}, error() {}, log() {} }, process: { env }, ...globals,
  }, { filename: file, timeout: 5000 });
  return exports;
}

export const moduleLoader = (snapshot = null) => (file, mocks = {}, env = {}, suffix = "", globals = {}) => moduleAt(file, mocks, env, suffix, globals, snapshot);

// Deliberately small, strict fake Supabase transport. Unknown operations throw.
// Filters and optimistic versions are honored; no real client is imported.
export function memoryDb(tables) {
  return {
    async rpc(name, args) {
      if (name !== "claim_partner_mail_sync") throw new Error(`Unexpected RPC ${name}`);
      const state = tables.partner_mail_sync[0];
      if (state.lock_id) return { data: false, error: null };
      state.lock_id = args.claim_id;
      return { data: true, error: null };
    },
    from(table) {
      if (!Object.hasOwn(tables, table)) throw new Error(`Unexpected table ${table}`);
      const predicates = [];
      let patch;
      let insertion;
      let start = 0;
      let end = Infinity;
      let ordering;
      const query = {
        select() { return this; },
        eq(key, value) { predicates.push((r) => r[key] === value); return this; },
        in(key, values) { predicates.push((r) => values.includes(r[key])); return this; },
        not(key, operator, value) {
          if (operator !== "is" || value !== null) throw new Error("Unsupported fake filter");
          predicates.push((r) => r[key] != null); return this;
        },
        order(key, options = {}) { ordering = [key, options.ascending !== false]; return this; },
        range(from, to) { start = from; end = to + 1; return this; },
        limit(count) { end = count; return this; },
        update(value) { patch = value; return this; },
        insert(value) { insertion = value; return this; },
        async maybeSingle() { const result = await this; return { ...result, data: result.data[0] ?? null }; },
        async single() { return this.maybeSingle(); },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (insertion) {
              if (tables[table].some((r) => r.thread_id && r.thread_id === insertion.thread_id)) throw new Error("Duplicate thread insert");
              tables[table].push({ version: 1, ...structuredClone(insertion) });
            }
            let selected = tables[table].filter((r) => predicates.every((p) => p(r)));
            if (patch) for (const row of selected) {
              const version = row.version;
              Object.assign(row, structuredClone(patch));
              if (table === "partner_responses") row.version = version + 1;
            }
            if (ordering) {
              const [key, ascending] = ordering;
              selected = [...selected].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
            }
            return { data: structuredClone(selected.slice(start, end)), error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}
