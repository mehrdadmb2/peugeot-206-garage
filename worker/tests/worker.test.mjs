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
