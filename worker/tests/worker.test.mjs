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
 assert.equal(body.version, "3.0.0");
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
