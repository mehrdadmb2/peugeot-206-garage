import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("GET /health is request-driven and does not require scheduled triggers", async () => {
 const response = await worker.fetch(new Request("https://unit.test/health"), {});
 assert.equal(response.status, 200);
 const body = await response.json();
 assert.equal(body.ok, true);
 assert.equal(body.mode, "request-driven");
 assert.match(body.scheduler, /no scheduled handler/);
});

test("GET / returns API guide", async () => {
 const response = await worker.fetch(new Request("https://unit.test/"), {});
 assert.equal(response.status, 200);
 const body = await response.json();
 assert.equal(body.service, "206 Garage API");
 assert.ok(body.endpoints.telegramWebhook);
});

test("unknown route returns 404", async () => {
 const response = await worker.fetch(new Request("https://unit.test/not-a-route"), {});
 assert.equal(response.status, 404);
});

test("private Telegram webhook rejects missing secret", async () => {
 const response = await worker.fetch(new Request("https://unit.test/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ update_id: 1 }) }), {});
 assert.equal(response.status, 403);
});

test("protected API rejects missing bearer token", async () => {
 const response = await worker.fetch(new Request("https://unit.test/api/v1/overview"), { API_ACCESS_TOKEN: "x".repeat(64) });
 assert.equal(response.status, 401);
});

test("API guide advertises reciprocal links and event management routes", async () => {
 const response = await worker.fetch(new Request("https://unit.test/"), {});
 const body = await response.json();
 assert.equal(body.version, "3.1.0");
 assert.match(body.dashboard, /^https:\/\//);
 assert.match(body.telegram, /t\.me\/Peugeot206GarageBot/);
 assert.ok(body.endpoints.updateEvent);
 assert.ok(body.endpoints.deleteEvent);
});

test("event update rejects an empty/unsupported patch before any GitHub write", async () => {
 const token = "t".repeat(64);
 const response = await worker.fetch(new Request("https://unit.test/api/v1/event/update", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ id: "a1b2c3d4", patch: { unsupportedField: "value" } })
 }), { API_ACCESS_TOKEN: token });
 assert.equal(response.status, 400);
 assert.equal((await response.json()).error, "empty_patch");
});

test("typed record stores actor and separate note while keeping the event description clean", async () => {
 const token = "t".repeat(64);
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: [] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 1, vehicle: { label: "206 SD" }, people: ["بابام"], serviceIntervals: {} })]
 ]);
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  const marker = "/contents/";
  const suffix = url.pathname.split(marker)[1];
  if (!suffix || !url.hostname.includes("api.github.com")) return new Response("unexpected request", { status: 500 });
  const path = suffix.split("/").map(decodeURIComponent).join("/");
  if ((init.method || "GET").toUpperCase() === "GET") {
   const content = files.get(path);
   if (content === undefined) return new Response("not found", { status: 404 });
   return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content, "utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (init.method === "PUT") {
   const body = JSON.parse(init.body);
   files.set(path, Buffer.from(body.content, "base64").toString("utf8"));
   return new Response(JSON.stringify({ content: { path } }), { status: 201, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected method", { status: 500 });
 };
 try {
  const response = await worker.fetch(new Request("https://unit.test/api/v1/record", {
   method: "POST",
   headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
   body: JSON.stringify({ type: "note", title: "آزمون نسبت‌دهی", description: "بابام: بازدید خودرو؛ توضیح: سفر خانوادگی" })
  }), { API_ACCESS_TOKEN: token, GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  const responseBody = await response.json();
  assert.equal(responseBody.persisted, true);
  const index = JSON.parse(files.get("data/index.json"));
  assert.equal(index.months.length, 1);
  const logPath = `data/logs/${index.months[0]}.json`;
  const log = JSON.parse(files.get(logPath));
  assert.equal(log.events.length, 1);
  assert.equal(log.events[0].actor, "بابام");
  assert.equal(log.events[0].note, "سفر خانوادگی");
  assert.equal(log.events[0].description, "بازدید خودرو");
 } finally {
  globalThis.fetch = originalFetch;
 }
});


test("odometer submitted by another driver attributes the distance since the prior reading to that driver", async () => {
 const token = "t".repeat(64);
 const existingLog = { schemaVersion: 1, month: "2026-10", events: [{
  id: "previous-reading-0001", type: "odometer", title: "ثبت کیلومترشمار", description: "/km 431200",
  actor: "من", occurredAt: "2026-10-22T09:00:00+03:30", date: "2026-10-22", time: "09:00", odometerKm: 431200, createdAt: "2026-10-22T05:30:00.000Z"
 }] };
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 1, vehicle: { label: "206 SD" }, people: [], serviceIntervals: {} })],
  ["data/logs/2026-10.json", JSON.stringify(existingLog)]
 ]);
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (!url.hostname.includes("api.github.com")) return new Response("unexpected upstream", { status: 500 });
  const suffix = url.pathname.split("/contents/")[1];
  const path = suffix.split("/").map(decodeURIComponent).join("/");
  if ((init.method || "GET").toUpperCase() === "GET") {
   const content = files.get(path);
   if (content === undefined) return new Response("not found", { status: 404 });
   return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content, "utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (init.method === "PUT") {
   const body = JSON.parse(init.body);
   files.set(path, Buffer.from(body.content, "base64").toString("utf8"));
   return new Response(JSON.stringify({ content: { path } }), { status: 201, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected method", { status: 500 });
 };
 try {
  const response = await worker.fetch(new Request("https://unit.test/api/v1/record", {
   method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
   body: JSON.stringify({ text: "بابام کیلومتر 431381" })
  }), { API_ACCESS_TOKEN: token, GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.persisted, true);
  assert.match(body.reply, /مسافت از آخرین کیلومتر ثبت‌شده: ۱۸۱ km/);
  const month = JSON.parse(files.get("data/logs/2026-10.json"));
  const current = month.events.find(event => event.type === "odometer" && event.odometerKm === 431381);
  assert.ok(current);
  assert.equal(current.actor, "بابام");
  assert.equal(current.deltaSincePreviousKm, 181);
  assert.equal(current.distanceActor, "بابام");
 } finally {
  globalThis.fetch = originalFetch;
 }
});

test("Telegram operations list formats IDs and quotes and uses named clickable navigation links", async () => {
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: "2026-10-23T06:00:00+03:30", months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 1, vehicle: { label: "Peugeot 206 SD" }, people: ["بابام"], serviceIntervals: {} })],
  ["data/logs/2026-10.json", JSON.stringify({ schemaVersion: 1, month: "2026-10", events: [{
   id: "abcdef12-1234-4321-abcd-123456789012", type: "fuel", title: "سوخت‌گیری", description: "۲۰ لیتر بنزین برای سفر",
   actor: "بابام", note: "بعد از سرویس انجام شد", occurredAt: "2026-10-23T06:00:00+03:30", date: "2026-10-23", time: "06:00",
   jalaliDate: "۱۴۰۵/۰۸/۰۱", odometerKm: 431381, liters: 20, costRial: 7000000, createdAt: "2026-10-23T02:30:00.000Z"
  }] })]
 ]);
 const telegramMessages = [];
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname.includes("api.github.com")) {
   const path = url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
   const content = files.get(path);
   if (content === undefined) return new Response("not found", { status: 404 });
   return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content, "utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/sendMessage")) {
   telegramMessages.push(JSON.parse(init.body));
   return new Response(JSON.stringify({ ok: true, result: { message_id: telegramMessages.length } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected upstream", { status: 500 });
 };
 try {
  const response = await worker.fetch(new Request("https://unit.test/telegram", {
   method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
   body: JSON.stringify({ update_id: 99, message: { message_id: 1, date: Math.floor(Date.now()/1000), text: "/operations all", from: { id: 42 }, chat: { id: 101 } } })
  }), { TELEGRAM_WEBHOOK_SECRET: "test-secret", ALLOWED_TELEGRAM_USER_ID: "42", TELEGRAM_BOT_TOKEN: "fake-telegram-token", GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  assert.equal(telegramMessages.length, 1);
  const sent = telegramMessages[0];
  assert.match(sent.text, /<code>abcdef12<\/code>/);
  assert.match(sent.text, /<blockquote>بعد از سرویس انجام شد<\/blockquote>/);
  assert.match(sent.text, /<a href="https:\/\/mehrdadmb2\.github\.io\/peugeot-206-garage\/">باز کردن داشبورد<\/a>/);
  assert.match(sent.text, /<a href="https:\/\/t\.me\/Peugeot206GarageBot">گفت‌وگو با ربات<\/a>/);
  assert.equal(sent.text.includes(">https://mehrdadmb2.github.io/peugeot-206-garage/<"), false);
  assert.ok(sent.reply_markup.inline_keyboard.some(row => row.some(button => /:detail$/.test(button.callback_data || ""))));
  assert.ok(sent.reply_markup.inline_keyboard.some(row => row.some(button => /:delete$/.test(button.callback_data || ""))));
 } finally {
  globalThis.fetch = originalFetch;
 }
});
