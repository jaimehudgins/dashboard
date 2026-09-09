import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { moduleAt, root } from "./offline-runtime.mjs";

// Native cron + native sender; no real Slack, Gmail, model, or database calls.
const calls = [];
const delivered = new Set();
const claims = new Map();
const posted = [];
const env = { CRON_SECRET: "synthetic-cron-secret", NEXTAUTH_URL: "https://leo.example" };
const urgent = { id: "thread-urgent", lastMessageId: "message-1", from: "Alex <alex@school.example>", subject: "Access denied before class", reason: "Lesson is blocked; class starts at 10 AM Central.", confidence: "high" };
const sender = moduleAt("src/lib/slack-notifications.ts", {
  "./supabase": {},
  "./slack": { isSlackNotificationsConfigured: true, postSlackNotification: async (content) => {
    calls.push("slack"); posted.push(content); return { channel: "synthetic-dm", ts: "1" };
  } },
  "./notification-store": {
    claimNotification: async ({ key }) => {
      calls.push("claim");
      if (delivered.has(key)) return { duplicate: true };
      claims.set("claim-id", key); return { duplicate: false, id: "claim-id" };
    },
    completeNotification: async (id) => { calls.push("complete"); delivered.add(claims.get(id)); },
    failNotification: async () => { throw new Error("Unexpected synthetic send failure"); },
  },
}, env);
class NextResponse extends Response {
  static json(body, options) { return Response.json(body, options); }
}
const cron = moduleAt("src/app/api/cron/classify-mail/route.ts", {
  "next/server": { NextResponse },
  "@/lib/mail-classify": {},
  "@/lib/google-auth": { isGoogleServerConfigured: true, getGoogleAccessToken: async () => "synthetic" },
  "@/lib/partner-mail-sync": { syncPartnerMail: async () => {
    calls.push("sync"); return { urgentPartnerThreads: [], changed: 1, complete: true };
  } },
  "@/lib/partner-response-store": { responseStoreConfigured: true, pendingPartnerAlerts: async () => [urgent] },
  "@/lib/slack-notifications": { sendUrgentPartnerEmailAlerts: sender.sendUrgentPartnerEmailAlerts, sendPendingWorkbenchAlerts: async () => ({ sent: 0, duplicates: 0, disabled: true }) },
  "@/lib/partner-response-policy": { assessPendingResponses: async () => {
    calls.push("assessment");
    assert.equal(posted.length, 1, "send urgent Slack before any deeper assessment or draft work");
    throw new Error("Synthetic deeper assessment unavailable");
  } },
}, env);
const request = (authorized) => new Request("https://leo.example/api/cron/classify-mail", { headers: authorized ? { authorization: `Bearer ${env.CRON_SECRET}` } : {} });
assert.equal((await cron.GET(request(false))).status, 401);
assert.equal(calls.length, 0, "unauthorized invocation does nothing");
const first = await (await cron.GET(request(true))).json();
assert.equal(first.urgentAlerts.sent, 1);
assert.match(first.responsePolicy.error, /assessment unavailable/);
assert.deepEqual(calls, ["sync", "claim", "slack", "complete", "assessment"]);
assert.match(posted[0], /Access denied before class/);
assert.match(posted[0], /10 AM Central/);
assert.match(posted[0], /Open in Gmail/);
assert.doesNotMatch(posted[0], /access is fixed|I (added|reset|created)/i);
const replay = await (await cron.GET(request(true))).json();
assert.equal(replay.urgentAlerts.duplicates, 1);
assert.equal(posted.length, 1, "same urgent message cannot trigger duplicate delivery");
const crons = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")).crons;
assert.equal(crons.find((entry) => entry.path === "/api/cron/classify-mail").schedule, "*/5 * * * *");
console.log("Urgent-email alert path passed: authenticated five-minute check, Slack before deeper assessment, successful alert retained when assessment fails, replay deduplicated. Offline transports only; classifier accuracy and production delivery are not measured.");
