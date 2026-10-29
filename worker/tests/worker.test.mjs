import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";

test("GET /health is request-driven and does not require scheduled triggers", async () => {
 const response = await worker.fetch(new Request("https://unit.test/health"), {});
 assert.equal(response.status, 200);
 const body = await response.json();
 assert.equal(body.ok, true);
 assert.equal(body.mode, "request-driven");
 assert.match(body.scheduler, /no scheduled handler/);
 assert.equal(body.version, "3.7.0");
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
 assert.equal(body.version, "3.7.0");
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

test("/analysis week sends one textual summary and four PNG charts", async () => {
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: "2026-10-23T09:00:00+03:30", months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 1, vehicle: { label: "Peugeot 206 SD" }, ownership: { purchaseOdometerKm: 428000, estimatedKmSincePurchaseKm: 2400, defaultActor: "من" }, people: [], serviceIntervals: {} })],
  ["data/logs/2026-10.json", JSON.stringify({ schemaVersion: 1, month: "2026-10", events: [
   { id: "read-0001-aaaa", type: "odometer", title: "کیلومتر", description: "ثبت کیلومتر", actor: "من", occurredAt: "2026-10-22T08:00:00+03:30", date: "2026-10-22", time: "08:00", odometerKm: 431215, createdAt: "2026-10-22T04:30:00.000Z" },
   { id: "fine-0002-aaaa", type: "fine", title: "جریمه", description: "سرعت", actor: "من", occurredAt: "2026-10-23T08:00:00+03:30", date: "2026-10-23", time: "08:00", costRial: 5000000, paid: false, createdAt: "2026-10-23T04:30:00.000Z" },
   { id: "fuel-0003-aaaa", type: "fuel", title: "سوخت", description: "سوخت‌گیری", actor: "من", occurredAt: "2026-10-23T08:30:00+03:30", date: "2026-10-23", time: "08:30", liters: 20, costRial: 7000000, odometerKm: 431215, createdAt: "2026-10-23T05:00:00.000Z" }
  ] })]
 ]);
 const sentMessages = [];
 const sentPhotos = [];
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === "api.github.com") {
   const path = url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
   const content = files.get(path);
   if (content === undefined) return new Response("not found", { status: 404 });
   return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content, "utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "quickchart.io") return new Response(Buffer.alloc(512, 9), { status: 200, headers: { "content-type": "image/png" } });
  if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/sendMessage")) {
   sentMessages.push(JSON.parse(init.body));
   return new Response(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/sendPhoto")) {
   sentPhotos.push(url.pathname);
   return new Response(JSON.stringify({ ok: true, result: { message_id: sentPhotos.length } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(`unexpected upstream ${url.hostname}${url.pathname}`, { status: 500 });
 };
 try {
  const response = await worker.fetch(new Request("https://unit.test/telegram", {
   method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
   body: JSON.stringify({ update_id: 100, message: { message_id: 2, date: Math.floor(Date.now()/1000), text: "/analysis week", from: { id: 42 }, chat: { id: 101 } } })
  }), { TELEGRAM_WEBHOOK_SECRET: "test-secret", ALLOWED_TELEGRAM_USER_ID: "42", TELEGRAM_BOT_TOKEN: "fake-telegram-token", GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  assert.equal(sentMessages.length, 1, "summary should be sent separately so image captions stay short");
  assert.match(sentMessages[0].text, /گزارش تحلیلی پژو/);
  assert.match(sentMessages[0].text, /اختلاف دو محاسبه/);
  assert.equal(sentPhotos.length, 4);
 } finally {
  globalThis.fetch = originalFetch;
 }
});

test("/fines reports total, paid and unpaid amounts", async () => {
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 1, vehicle: { label: "206 SD" }, people: [], serviceIntervals: {} })],
  ["data/logs/2026-10.json", JSON.stringify({ schemaVersion: 1, month: "2026-10", events: [
   { id: "fine-paid-1111", type: "fine", description: "جریمه پرداخت‌شده", occurredAt: "2026-10-20T10:00:00+03:30", date: "2026-10-20", costRial: 10000000, paid: true, paidAt: "2026-10-21T10:00:00+03:30" },
   { id: "fine-open-2222", type: "fine", description: "جریمه باز", occurredAt: "2026-10-22T10:00:00+03:30", date: "2026-10-22", costRial: 25000000, paid: false }
  ] })]
 ]);
 const sentMessages=[];
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.hostname==="api.github.com"){
   const path=url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
   const content=files.get(path); if(content===undefined)return new Response("not found",{status:404});
   return new Response(JSON.stringify({sha:`sha-${path}`,content:Buffer.from(content,"utf8").toString("base64")}),{status:200,headers:{"content-type":"application/json"}});
  }
  if(url.hostname==="api.telegram.org"&&url.pathname.endsWith("/sendMessage")){sentMessages.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true,result:{message_id:sentMessages.length}}),{status:200,headers:{"content-type":"application/json"}})}
  return new Response("unexpected upstream",{status:500});
 };
 try{
  const response=await worker.fetch(new Request("https://unit.test/telegram",{method:"POST",headers:{"content-type":"application/json","X-Telegram-Bot-Api-Secret-Token":"test-secret"},body:JSON.stringify({update_id:101,message:{message_id:3,date:Math.floor(Date.now()/1000),text:"/fines",from:{id:42},chat:{id:101}}})}),{TELEGRAM_WEBHOOK_SECRET:"test-secret",ALLOWED_TELEGRAM_USER_ID:"42",TELEGRAM_BOT_TOKEN:"fake-telegram-token",GITHUB_TOKEN:"fake-github-token",GITHUB_OWNER:"mehrdadmb2",GITHUB_REPO:"peugeot-206-garage",GITHUB_BRANCH:"main"});
  assert.equal(response.status,200); assert.equal(sentMessages.length,1);
  assert.match(sentMessages[0].text,/مجموع مبلغ تمام جریمه‌ها/);
  assert.match(sentMessages[0].text,/مجموع پرداخت‌شده/);
  assert.match(sentMessages[0].text,/بدهی پرداخت‌نشده/);
 }finally{globalThis.fetch=originalFetch;}
});

test("/purchasekm surfaces the arithmetic discrepancy without changing odometer history", async () => {
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 1, vehicle: { label: "206 SD" }, people: [], serviceIntervals: {}, ownership: { purchaseOdometerKm: 428000, estimatedKmSincePurchaseKm: 2400, defaultActor: "من" } })],
  ["data/logs/2026-10.json", JSON.stringify({ schemaVersion: 1, month: "2026-10", events: [
   { id: "odometer-current-1111", type: "odometer", description: "/km 431381", actor: "من", occurredAt: "2026-10-23T09:00:00+03:30", date: "2026-10-23", time: "09:00", odometerKm: 431381, createdAt: "2026-10-23T05:30:00.000Z" }
  ] })]
 ]);
 const sentMessages=[];
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.hostname==="api.github.com"){
   const path=url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
   const content=files.get(path); if(content===undefined)return new Response("not found",{status:404});
   return new Response(JSON.stringify({sha:`sha-${path}`,content:Buffer.from(content,"utf8").toString("base64")}),{status:200,headers:{"content-type":"application/json"}});
  }
  if(url.hostname==="api.telegram.org"&&url.pathname.endsWith("/sendMessage")){sentMessages.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true,result:{message_id:sentMessages.length}}),{status:200,headers:{"content-type":"application/json"}})}
  return new Response("unexpected upstream",{status:500});
 };
 try{
  const response=await worker.fetch(new Request("https://unit.test/telegram",{method:"POST",headers:{"content-type":"application/json","X-Telegram-Bot-Api-Secret-Token":"test-secret"},body:JSON.stringify({update_id:102,message:{message_id:4,date:Math.floor(Date.now()/1000),text:"/purchasekm",from:{id:42},chat:{id:101}}})}),{TELEGRAM_WEBHOOK_SECRET:"test-secret",ALLOWED_TELEGRAM_USER_ID:"42",TELEGRAM_BOT_TOKEN:"fake-telegram-token",GITHUB_TOKEN:"fake-github-token",GITHUB_OWNER:"mehrdadmb2",GITHUB_REPO:"peugeot-206-garage",GITHUB_BRANCH:"main"});
  assert.equal(response.status,200); assert.equal(sentMessages.length,1);
  assert.match(sentMessages[0].text,/۳٬۳۸۱/);
  assert.match(sentMessages[0].text,/۹۸۱/);
  assert.match(sentMessages[0].text,/کیلومتر واقعی روی کیلومترشمار را تأیید کن/);
  assert.equal(JSON.parse(files.get("data/logs/2026-10.json")).events[0].odometerKm,431381,"report must not rewrite the odometer to fit the estimate");
 }finally{globalThis.fetch=originalFetch;}
});


test("repairjob expands a multi-part workshop visit, preserves actor/specs and keeps unknown costs blank", async () => {
 const token = "r".repeat(64);
 const log = { schemaVersion: 1, month: "2026-10", events: [{ id: "odo-before-0001", type: "odometer", title: "ثبت کیلومتر", description: "/km 431381", actor: "من", occurredAt: "2026-10-23T10:00:00+03:30", date: "2026-10-23", time: "10:00", odometerKm: 431381, createdAt: "2026-10-23T06:30:00.000Z" }] };
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 2, vehicle: { label: "206 SD" }, people: ["بابام"], ownership: { purchaseOdometerKm: 428000, estimatedKmSincePurchaseKm: 2400 }, serviceIntervals: { spark_plugs: { label: "شمع موتور", intervalKm: 20000, intervalDays: 730 } }, partCatalog: { categories: {}, items: { spark_plugs: { label: "شمع موتور", category: "engine", mode: "periodic" }, spark_plug_wires: { label: "وایر شمع", category: "engine", mode: "condition" }, battery: { label: "باتری", category: "electrical", mode: "condition" }, thermostat: { label: "ترموستات", category: "cooling", mode: "condition" }, thermostat_housing: { label: "محفظه ترموستات", category: "cooling", mode: "condition" } }, services: { engine_diagnostics: { label: "دیاگ", aliases: ["دیاگ"] }, cooling_fan_adjustment: { label: "تنظیم فن", aliases: ["تنظیم دور فن"] }, cooling_bleed: { label: "هواگیری", aliases: ["هواگیری"] } } } })],
  ["data/logs/2026-10.json", JSON.stringify(log)]
 ]);
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (!url.hostname.includes("api.github.com")) return new Response("unexpected upstream", { status: 500 });
  const suffix = url.pathname.split("/contents/")[1];
  const path = suffix.split("/").map(decodeURIComponent).join("/");
  if ((init.method || "GET").toUpperCase() === "GET") {
   const content = files.get(path); if (content === undefined) return new Response("not found", { status: 404 });
   return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content, "utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (init.method === "PUT") {
   const body = JSON.parse(init.body); files.set(path, Buffer.from(body.content, "base64").toString("utf8"));
   return new Response(JSON.stringify({ content: { path } }), { status: 201, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected method", { status: 500 });
 };
 try {
  const response = await worker.fetch(new Request("https://unit.test/api/v1/record", {
   method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
   body: JSON.stringify({ text: "امروز ماشین دیشب روشن نشد امروز بابام بردش تعمیرگاه و روی کیلومتر 431462 دیاگ زده شد درجه آب و دور فن تنظیم شد شمع ها عوض شدن وایر شمع ها عوض شدن باتری عوض شد با مشخصات 12 ولت 60 امپر برند باتری را نمیدونم با قیمت 4.5 ملیون تومان ترموستات و محفظه ترموستات قسمت محفظه ترموستات 1.5 ملیون تومان عوض شد و هوا گیری شد" })
  }), { API_ACCESS_TOKEN: token, GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.persisted, true, body.reply);
  const currentLog = JSON.parse(files.get("data/logs/2026-10.json"));
  const created = currentLog.events.filter(e => e.repairGroupId);
  assert.ok(created.length >= 7, `expected multiple repair rows; got ${created.length}`);
  assert.ok(created.every(e => e.actor === "بابام"));
  const battery = created.find(e => e.componentKey === "battery");
  assert.ok(battery); assert.equal(battery.costRial, 45000000); assert.equal(battery.brand, "نامشخص");
  assert.equal(battery.specs.voltageV, 12); assert.equal(battery.specs.capacityAh, 60);
  const housing = created.find(e => e.componentKey === "thermostat_housing");
  assert.ok(housing); assert.equal(housing.costRial, 15000000);
  const thermostat = created.find(e => e.componentKey === "thermostat"); assert.ok(thermostat); assert.equal(thermostat.costRial, null);
  const issue = created.find(e => e.type === "issue"); assert.equal(issue.status, "fixed");
 } finally { globalThis.fetch = originalFetch; }
});

test("Telegram webhook acknowledges immediately when waitUntil is available and later sends the response", async () => {
 const sent = [];
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/sendMessage")) {
   sent.push(JSON.parse(init.body));
   return new Response(JSON.stringify({ ok: true, result: { message_id: sent.length } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected upstream", { status: 500 });
 };
 let backgroundTask;
 try {
  const response = await worker.fetch(new Request("https://unit.test/telegram", {
   method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
   body: JSON.stringify({ update_id: 99001, message: { message_id: 1, date: Math.floor(Date.now()/1000), text: "/start", from: { id: 42 }, chat: { id: 101 } } })
  }), { TELEGRAM_WEBHOOK_SECRET: "test-secret", ALLOWED_TELEGRAM_USER_ID: "42", TELEGRAM_BOT_TOKEN: "fake-token" }, { waitUntil(promise) { backgroundTask = promise; } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.accepted, true);
  assert.equal(body.processing, "background");
  assert.ok(backgroundTask instanceof Promise);
  await backgroundTask;
  assert.ok(sent.length >= 1);
  assert.match(sent[0].text, /دفتر هوشمند|شروع|فرمان/);
 } finally { globalThis.fetch = originalFetch; }
});

test("exact duplicate Telegram message is not saved without confirmation and offers yes/no actions", async () => {
 const text = "/note تکرار آزمایشی";
 const normalized = text.normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/\s+/g, " ").trim().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
 const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
 const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 1, vehicle: { label: "206 SD" }, people: [], serviceIntervals: {} })],
  ["data/logs/2026-10.json", JSON.stringify({ schemaVersion: 1, month: "2026-10", events: [{ id: "duplicate-old-0001", type: "note", title: "یادداشت خودرو", description: "تکرار آزمایشی", actor: "من", occurredAt: "2026-10-24T10:00:00+03:30", date: "2026-10-24", createdAt: "2026-10-24T06:30:00.000Z", metadata: { messageFingerprint: fingerprint } }] })]
 ]);
 const sentMessages = [];
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === "api.github.com") {
   const path = url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
   const method = (init.method || "GET").toUpperCase();
   const content = files.get(path);
   if (method === "GET") {
    if (content === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content,"utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
   }
   if (method === "PUT") {
    const body = JSON.parse(init.body); files.set(path, Buffer.from(body.content,"base64").toString("utf8"));
    return new Response(JSON.stringify({ content: { path } }), { status: 201, headers: { "content-type": "application/json" } });
   }
  }
  if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/sendMessage")) {
   sentMessages.push(JSON.parse(init.body));
   return new Response(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/answerCallbackQuery")) return new Response(JSON.stringify({ ok: true, result: true }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("unexpected upstream", { status: 500 });
 };
 const env = { TELEGRAM_WEBHOOK_SECRET: "test-secret", ALLOWED_TELEGRAM_USER_ID: "42", TELEGRAM_BOT_TOKEN: "fake-token", GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" };
 const sendUpdate = (body) => worker.fetch(new Request("https://unit.test/telegram", { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" }, body: JSON.stringify(body) }), env);
 try {
  const response = await sendUpdate({ update_id: 99002, message: { message_id: 2, date: Math.floor(Date.now()/1000), text, from: { id: 42 }, chat: { id: 101 } } });
  assert.equal(response.status, 200);
  assert.equal(sentMessages.length, 2, "receipt + duplicate confirmation prompt");
  assert.match(sentMessages[1].text, /احتمال ثبت تکراری/);
  assert.ok(sentMessages[1].reply_markup.inline_keyboard.flat().some(button => /dupc:[a-f0-9]{8}:yes/.test(button.callback_data || "")));
  assert.equal(JSON.parse(files.get("data/logs/2026-10.json")).events.length, 1, "no duplicate event is written before confirmation");
  const pending = JSON.parse(files.get("data/pending-duplicates.json"));
  const token = Object.keys(pending.items)[0]; assert.ok(token);
  await sendUpdate({ update_id: 99003, callback_query: { id: "cb-no", data: `dupc:${token}:no`, from: { id: 42 }, message: { message_id: 20, chat: { id: 101 } } } });
  assert.equal(JSON.parse(files.get("data/logs/2026-10.json")).events.length, 1, "declining the prompt keeps the prior history unchanged");
  assert.match(sentMessages.at(-1).text, /هیچ عملیات جدیدی ثبت نشد|سوابق قبلی بدون تغییر/);
 } finally { globalThis.fetch = originalFetch; }
});


test("repeated multi-part repairjob prompts before writing a second workshop visit", async () => {
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: [] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 3, vehicle: { label: "206 SD" }, people: ["بابام"], serviceIntervals: {}, partCatalog: {
   categories: { engine: { label: "موتور", icon: "⚙️" }, electrical: { label: "برق", icon: "🔋" } },
   items: { battery: { label: "باتری", category: "electrical", mode: "condition", aliases: ["باتری"] } },
   services: { engine_diagnostics: { label: "دیاگ موتور", category: "engine", aliases: ["دیاگ"] } }
  } })]
 ]);
 const sentMessages=[];
 const timeline=[];
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.hostname==="api.github.com"){
   timeline.push(`github:${(init.method||"GET").toUpperCase()}`);
   const path=url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
   const method=(init.method||"GET").toUpperCase();
   const content=files.get(path);
   if(method==="GET"){
    if(content===undefined)return new Response("not found",{status:404});
    return new Response(JSON.stringify({sha:`sha-${path}`,content:Buffer.from(content,"utf8").toString("base64")}),{status:200,headers:{"content-type":"application/json"}});
   }
   if(method==="PUT"){
    const body=JSON.parse(init.body);files.set(path,Buffer.from(body.content,"base64").toString("utf8"));
    return new Response(JSON.stringify({content:{path}}),{status:201,headers:{"content-type":"application/json"}});
   }
  }
  if(url.hostname==="api.telegram.org"&&url.pathname.endsWith("/sendMessage")){timeline.push("telegram:sendMessage");sentMessages.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true,result:{message_id:sentMessages.length}}),{status:200,headers:{"content-type":"application/json"}})}
  if(url.hostname==="api.telegram.org"&&url.pathname.endsWith("/answerCallbackQuery"))return new Response(JSON.stringify({ok:true,result:true}),{status:200,headers:{"content-type":"application/json"}});
  return new Response(`unexpected upstream ${url.hostname}${url.pathname}`,{status:500});
 };
 const env={TELEGRAM_WEBHOOK_SECRET:"test-secret",ALLOWED_TELEGRAM_USER_ID:"42",TELEGRAM_BOT_TOKEN:"fake-token",GITHUB_TOKEN:"fake-github-token",GITHUB_OWNER:"mehrdadmb2",GITHUB_REPO:"peugeot-206-garage",GITHUB_BRANCH:"main"};
 const text="/repairjob بابام کیلومتر 431462 دیاگ زده شد و باتری عوض شد";
 const sendUpdate=(id,updateId,body)=>worker.fetch(new Request("https://unit.test/telegram",{method:"POST",headers:{"content-type":"application/json","X-Telegram-Bot-Api-Secret-Token":"test-secret"},body:JSON.stringify({update_id:updateId,message:{message_id:id,date:Math.floor(Date.now()/1000),text,from:{id:42},chat:{id:101}}})}),env);
 try{
  const first=await sendUpdate(1,99101,{});assert.equal(first.status,200);
  assert.equal(timeline[0], "telegram:sendMessage", "user receipt must be sent before the first GitHub call");
  const indexAfterFirst=JSON.parse(files.get("data/index.json"));
  const month=indexAfterFirst.months[0];
  const before=JSON.parse(files.get(`data/logs/${month}.json`)).events;
  assert.equal(before.length,3,"initial repair job should create an odometer row, service and battery rows");
  const second=await sendUpdate(2,99102,{});assert.equal(second.status,200);
  const after=JSON.parse(files.get(`data/logs/${month}.json`)).events;
  assert.equal(after.length,3,"exact repeated repair job must not create a second set of rows");
  assert.ok(sentMessages.some(message=>/احتمال ثبت تکراری/.test(message.text)));
  const prompt=sentMessages.find(message=>/احتمال ثبت تکراری/.test(message.text));
  const token=prompt.reply_markup.inline_keyboard.flat().find(button=>/:no$/.test(button.callback_data)).callback_data.match(/^dupc:([a-f0-9]{8}):no$/)[1];
  await worker.fetch(new Request("https://unit.test/telegram", {
   method: "POST",
   headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
   body: JSON.stringify({ update_id: 99103, callback_query: { id: "dup-no", data: `dupc:${token}:no`, from: { id: 42 }, message: { message_id: prompt.message_id || 5, chat: { id: 101 } } } })
  }), env);
  assert.equal(JSON.parse(files.get(`data/logs/${month}.json`)).events.length,3,"declining confirmation must keep the event count unchanged");
 }finally{globalThis.fetch=originalFetch;}
});


test("/duplicates presents manual merge and archive choices without changing events", async () => {
 const same = { type: "fuel", title: "سوخت‌گیری", description: "۲۰ لیتر بنزین", actor: "من", occurredAt: "2026-10-23T08:00:00+03:30", date: "2026-10-23", liters: 20, costRial: 7000000, odometerKm: 431200, createdAt: "2026-10-23T04:30:00.000Z" };
 const files=new Map([
  ["data/index.json",JSON.stringify({schemaVersion:1,updatedAt:null,months:["2026-10"]})],
  ["data/config.json",JSON.stringify({schemaVersion:1,vehicle:{label:"206 SD"},people:[],serviceIntervals:{}})],
  ["data/logs/2026-10.json",JSON.stringify({schemaVersion:1,month:"2026-10",events:[{...same,id:"fuel-duplicate-0001"},{...same,id:"fuel-duplicate-0002",createdAt:"2026-10-23T04:40:00.000Z"}]})]
 ]);
 const sentMessages=[];const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.hostname==="api.github.com"){
   const path=url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");const content=files.get(path);
   if(content===undefined)return new Response("not found",{status:404});
   return new Response(JSON.stringify({sha:`sha-${path}`,content:Buffer.from(content,"utf8").toString("base64")}),{status:200,headers:{"content-type":"application/json"}});
  }
  if(url.hostname==="api.telegram.org"&&url.pathname.endsWith("/sendMessage")){sentMessages.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true,result:{message_id:sentMessages.length}}),{status:200,headers:{"content-type":"application/json"}})}
  return new Response("unexpected upstream",{status:500});
 };
 try{
  const response=await worker.fetch(new Request("https://unit.test/telegram",{method:"POST",headers:{"content-type":"application/json","X-Telegram-Bot-Api-Secret-Token":"test-secret"},body:JSON.stringify({update_id:99104,message:{message_id:4,date:Math.floor(Date.now()/1000),text:"/duplicates",from:{id:42},chat:{id:101}}})}),{TELEGRAM_WEBHOOK_SECRET:"test-secret",ALLOWED_TELEGRAM_USER_ID:"42",TELEGRAM_BOT_TOKEN:"fake-token",GITHUB_TOKEN:"fake-github-token",GITHUB_OWNER:"mehrdadmb2",GITHUB_REPO:"peugeot-206-garage",GITHUB_BRANCH:"main"});
  assert.equal(response.status,200);assert.ok(sentMessages.length>=2);
  assert.ok(sentMessages.some(message=>/جفت احتمالی تکراری/.test(message.text)));
  const pair=sentMessages.find(message=>/جفت احتمالی تکراری/.test(message.text));
  assert.ok(pair.reply_markup.inline_keyboard.flat().some(button=>String(button.callback_data||"").startsWith("dupmerge:")));
  assert.equal(JSON.parse(files.get("data/logs/2026-10.json")).events.length,2,"reviewing duplicates must not mutate history until a button is selected");
 }finally{globalThis.fetch=originalFetch;}
});


test("replacement part counts as the latest maintenance event in the due report", async () => {
 const token="d".repeat(64);
 const files=new Map([
  ["data/index.json",JSON.stringify({schemaVersion:1,updatedAt:null,months:["2026-10"]})],
  ["data/config.json",JSON.stringify({schemaVersion:2,vehicle:{label:"206 SD"},people:[],serviceIntervals:{spark_plugs:{label:"شمع موتور",intervalKm:20000,intervalDays:730}},partCatalog:{categories:{engine:{label:"موتور"}},items:{spark_plugs:{label:"شمع موتور",category:"engine",mode:"periodic",intervalKm:20000,intervalDays:730}},services:{}}})],
  ["data/logs/2026-10.json",JSON.stringify({schemaVersion:1,month:"2026-10",events:[
   {id:"odo-current-0001",type:"odometer",title:"کیلومترشمار",description:"ثبت فعلی",occurredAt:"2026-10-24T10:00:00+03:30",date:"2026-10-24",odometerKm:451500,createdAt:"2026-10-24T06:30:00.000Z"},
   {id:"plugs-installed-001",type:"part",title:"تعویض قطعه: شمع موتور",description:"شمع موتور",componentKey:"spark_plugs",componentReplaced:true,serviceKey:null,actor:"من",occurredAt:"2026-01-01T10:00:00+03:30",date:"2026-01-01",odometerKm:431462,createdAt:"2026-01-01T06:30:00.000Z"}
  ]})]
 ]);
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.hostname==="api.github.com"){
   const path=url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");const content=files.get(path);
   if(content===undefined)return new Response("not found",{status:404});
   return new Response(JSON.stringify({sha:`sha-${path}`,content:Buffer.from(content,"utf8").toString("base64")}),{status:200,headers:{"content-type":"application/json"}});
  }
  return new Response("unexpected upstream",{status:500});
 };
 try{
  const response=await worker.fetch(new Request("https://unit.test/api/v1/due",{headers:{authorization:`Bearer ${token}`}}),{API_ACCESS_TOKEN:token,GITHUB_TOKEN:"fake-github-token",GITHUB_OWNER:"mehrdadmb2",GITHUB_REPO:"peugeot-206-garage",GITHUB_BRANCH:"main"});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.ok(body.dueItems.some(item=>item.key==="spark_plugs"),"installed part without serviceKey should still anchor its periodic reminder by componentKey");
 }finally{globalThis.fetch=originalFetch;}
});

test("a completed repair for a scheduled component resets the maintenance countdown", async () => {
 const token="r".repeat(64);
 const files=new Map([
  ["data/index.json",JSON.stringify({schemaVersion:1,updatedAt:null,months:["2026-10"]})],
  ["data/config.json",JSON.stringify({schemaVersion:6,vehicle:{label:"206 SD"},people:[],serviceIntervals:{spark_plugs:{label:"شمع موتور",intervalKm:20000,intervalDays:730,mode:"periodic"}},maintenanceOverrides:{},partCatalog:{categories:{engine:{label:"موتور"}},items:{spark_plugs:{label:"شمع موتور",category:"engine",mode:"periodic",intervalKm:20000,intervalDays:730}},services:{}}})],
  ["data/logs/2026-10.json",JSON.stringify({schemaVersion:1,month:"2026-10",events:[
   {id:"odo-current-repair-01",type:"odometer",title:"کیلومتر فعلی",description:"قرائت",occurredAt:"2026-10-29T10:00:00+03:30",date:"2026-10-29",odometerKm:451500,createdAt:"2026-10-29T06:30:00.000Z"},
   {id:"old-plugs-installed-01",type:"part",title:"تعویض شمع",description:"شمع قبلی",componentKey:"spark_plugs",componentReplaced:true,occurredAt:"2026-01-01T10:00:00+03:30",date:"2026-01-01",odometerKm:431462,createdAt:"2026-01-01T06:30:00.000Z"},
   {id:"plugs-repaired-0001",type:"repair",title:"سرویس شمع",description:"بازدید و سرویس شمع",componentKey:"spark_plugs",occurredAt:"2026-10-27T10:00:00+03:30",date:"2026-10-27",odometerKm:451000,createdAt:"2026-10-27T06:30:00.000Z"}
  ]})]
 ]);
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(!url.hostname.includes("api.github.com"))return new Response("unexpected upstream",{status:500});
  const path=url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
  const content=files.get(path);if(content===undefined)return new Response("not found",{status:404});
  return new Response(JSON.stringify({sha:`sha-${path}`,content:Buffer.from(content,"utf8").toString("base64")}),{status:200,headers:{"content-type":"application/json"}});
 };
 try{
  const response=await worker.fetch(new Request("https://unit.test/api/v1/due",{headers:{authorization:`Bearer ${token}`}}),{API_ACCESS_TOKEN:token,GITHUB_TOKEN:"fake",GITHUB_OWNER:"mehrdadmb2",GITHUB_REPO:"peugeot-206-garage",GITHUB_BRANCH:"main"});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.ok(!body.dueItems.some(item=>item.key==="spark_plugs"),"the more recent completed repair must be used instead of the old installation");
 }finally{globalThis.fetch=originalFetch;}
});

function mockContentsApi(files, timeline = [], telegramMessages = []) {
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === "api.github.com" && url.pathname.includes("/contents/")) {
   const path = url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
   timeline.push(`github:${(init.method || "GET").toUpperCase()}:${path}`);
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
   return new Response("unexpected method", { status: 405 });
  }
  if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/sendMessage")) {
   const body = JSON.parse(init.body);
   telegramMessages.push(body);
   timeline.push("telegram:sendMessage");
   return new Response(JSON.stringify({ ok: true, result: { message_id: telegramMessages.length } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected upstream", { status: 500 });
 };
 return () => { globalThis.fetch = originalFetch; };
}

test("natural no-start report without odometer inherits the latest valid odometer and gets a Telegram acknowledgement", async () => {
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 2, vehicle: { label: "206 SD" }, people: [], serviceIntervals: {}, ownership: { purchaseOdometerKm: 428000, estimatedKmSincePurchaseKm: 2400 } })],
  ["data/logs/2026-10.json", JSON.stringify({ schemaVersion: 1, month: "2026-10", events: [{ id: "latest-odo-001", type: "odometer", title: "کیلومترشمار", description: "آخرین کیلومتر معتبر", actor: "من", occurredAt: "2026-10-25T10:00:00+03:30", date: "2026-10-25", time: "10:00", odometerKm: 431462, createdAt: "2026-10-25T06:30:00.000Z" }] })]
 ]);
 const timeline = [], telegramMessages = [], restoreFetch = mockContentsApi(files, timeline, telegramMessages);
 const env = { TELEGRAM_WEBHOOK_SECRET: "test-secret", ALLOWED_TELEGRAM_USER_ID: "42", TELEGRAM_BOT_TOKEN: "fake-token", GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" };
 const pending = [];
 try {
  const response = await worker.fetch(new Request("https://unit.test/telegram", {
   method: "POST", headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
   body: JSON.stringify({ update_id: 775501, message: { message_id: 801, date: Math.floor(Date.now()/1000), text: "ماشین روشن نمیشه", from: { id: 42 }, chat: { id: 101 } } })
  }), env, { waitUntil(promise) { pending.push(promise); } });
  assert.equal(response.status, 200);
  await Promise.all(pending);
  assert.ok(telegramMessages.some(item => /پیام دریافت شد/.test(item.text)), "the user should get an acknowledgement before the GitHub writes");
  assert.equal(timeline[0], "telegram:sendMessage", "the first upstream side effect should acknowledge the user, not contact GitHub");
  const index = JSON.parse(files.get("data/index.json"));
  const updatedMonths = await Promise.all(index.months.map(month => JSON.parse(files.get(`data/logs/${month}.json`) || "{\"events\":[]}")));
  const created = updatedMonths.flatMap(month => month.events || []).find(event => event.type === "issue" && event.description.includes("روشن"));
  assert.ok(created, "no-start natural language should create an issue event");
  assert.equal(created.odometerKm, 431462);
  assert.equal(created.odometerAutoAssigned, true);
  assert.ok(telegramMessages.some(item => /خودکار از آخرین کیلومتر معتبر/.test(item.text)), "confirmation should explain that odometer was inherited");
 } finally { restoreFetch(); }
});

test("fuel report calculates full-to-full consumption from partial fills between checkpoints", async () => {
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: ["2026-10"] })],
  ["data/config.json", JSON.stringify({ schemaVersion: 2, vehicle: { label: "206 SD" }, people: [], serviceIntervals: {}, ownership: { purchaseOdometerKm: 428000, estimatedKmSincePurchaseKm: 2400 } })],
  ["data/logs/2026-10.json", JSON.stringify({ schemaVersion: 1, month: "2026-10", events: [
   { id: "full-a-00001", type: "fuel", title: "باک کامل اول", occurredAt: "2026-10-01T10:00:00+03:30", date: "2026-10-01", time: "10:00", odometerKm: 100000, liters: 0, fullTank: true, costRial: null },
   { id: "partial-00001", type: "fuel", title: "سوخت‌گیری نیمه", occurredAt: "2026-10-05T10:00:00+03:30", date: "2026-10-05", time: "10:00", odometerKm: 100180, liters: 10, fullTank: false, costRial: 2000000 },
   { id: "full-b-00001", type: "fuel", title: "باک کامل دوم", occurredAt: "2026-10-10T10:00:00+03:30", date: "2026-10-10", time: "10:00", odometerKm: 100400, liters: 30, fullTank: true, costRial: 6000000 }
  ] })]
 ]);
 const timeline = [], restoreFetch = mockContentsApi(files, timeline, []);
 const token = "f".repeat(64);
 try {
  const response = await worker.fetch(new Request("https://unit.test/api/v1/record", {
   method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "/fuelstats" })
  }), { API_ACCESS_TOKEN: token, GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.reply, /۱۰ لیتر در ۱۰۰ کیلومتر/);
  assert.match(body.reply, /۴۰۰ km/);
  assert.match(body.reply, /۴۰ لیتر/);
 } finally { restoreFetch(); }
});


test("/km 431503 تعمیر ماشین بابام preserves the driver and note instead of recording only the mileage", async () => {
 const token = "k".repeat(64);
 const config = JSON.parse(readFileSync(new URL("./fixtures/config.fixture.json", import.meta.url), "utf8"));
 const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
 const previousDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: [month] })],
  ["data/config.json", JSON.stringify(config)],
  [`data/logs/${month}.json`, JSON.stringify({ schemaVersion: 1, month, events: [{ id: "prev-mileage-driver-001", type: "odometer", title: "آخرین کیلومتر", description: "قرائت قبلی", actor: "من", occurredAt: `${previousDate}T10:00:00+03:30`, date: previousDate, time: "10:00", odometerKm: 431400, createdAt: `${previousDate}T06:30:00.000Z` }] })]
 ]);
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (!url.hostname.includes("api.github.com")) return new Response("unexpected upstream", { status: 500 });
  const path = url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
  if ((init.method || "GET").toUpperCase() === "GET") {
   const content = files.get(path); if (content === undefined) return new Response("not found", { status: 404 });
   return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content, "utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (init.method === "PUT") {
   const body = JSON.parse(init.body); files.set(path, Buffer.from(body.content, "base64").toString("utf8"));
   return new Response(JSON.stringify({ content: { path } }), { status: 201, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected method", { status: 500 });
 };
 try {
  const response = await worker.fetch(new Request("https://unit.test/api/v1/record", {
   method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
   body: JSON.stringify({ text: "/km 431503 تعمیر ماشین بابام" })
  }), { API_ACCESS_TOKEN: token, GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.persisted, true, body.reply);
  assert.match(body.reply, /انجام‌دهنده: بابام/);
  assert.match(body.reply, /تعمیر ماشین/);
  const log = JSON.parse(files.get(`data/logs/${month}.json`));
  const event = log.events.find(item => item.type === "odometer" && item.odometerKm === 431503);
  assert.ok(event);
  assert.equal(event.actor, "بابام");
  assert.match(event.description, /تعمیر ماشین/);
  assert.equal(event.deltaSincePreviousKm, 103);
  assert.equal(event.distanceActor, "بابام");
 } finally { globalThis.fetch = originalFetch; }
});

test("repairjob understands oils, crankshaft sensor and cable prices, labor, and an unresolved gearbox leak without false replacement cost", async () => {
 const token = "j".repeat(64);
 const config = JSON.parse(readFileSync(new URL("./fixtures/config.fixture.json", import.meta.url), "utf8"));
 const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
 const priorDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: [month] })],
  ["data/config.json", JSON.stringify(config)],
  [`data/logs/${month}.json`, JSON.stringify({ schemaVersion: 1, month, events: [{ id: "prior-odo-repair-v36", type: "odometer", title: "آخرین کیلومتر", description: "قرائت قبلی", actor: "من", occurredAt: `${priorDate}T09:00:00+03:30`, date: priorDate, time: "09:00", odometerKm: 431400, createdAt: `${priorDate}T05:30:00.000Z` }] })]
 ]);
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (!url.hostname.includes("api.github.com")) return new Response("unexpected upstream", { status: 500 });
  const path = url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
  if ((init.method || "GET").toUpperCase() === "GET") {
   const content = files.get(path); if (content === undefined) return new Response("not found", { status: 404 });
   return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(content, "utf8").toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (init.method === "PUT") {
   const body = JSON.parse(init.body); files.set(path, Buffer.from(body.content, "base64").toString("utf8"));
   return new Response(JSON.stringify({ content: { path } }), { status: 201, headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected method", { status: 500 });
 };
 try {
  const prompt = "/repairjob بابام کیلومتر 431503 امروز ماشین دیشب روشن نشد و به تعمیرگاه بردیم؛ علت روشن نشدن سنسور دور موتور بود؛ سنسور دور موتور تعویض شد، قیمت سنسور دور موتور 1.25 ملیون تومان؛ سیم سنسور دور موتور تعویض شد، قیمت کابل سنسور دور موتور 250 هزار تومان؛ نشتی روغن هیدرولیک برطرف شد؛ روغن هیدرولیک تعویض شد؛ نشتی روغن واسکازین داریم که هنوز برطرف نشده؛ اجرت رفع نشتی روغن هیدرولیک 1.5 ملیون تومان";
  const response = await worker.fetch(new Request("https://unit.test/api/v1/record", {
   method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
   body: JSON.stringify({ text: prompt })
  }), { API_ACCESS_TOKEN: token, GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.persisted, true, body.reply);
  const log = JSON.parse(files.get(`data/logs/${month}.json`));
  const group = log.events.filter(event => event.repairGroupId);
  assert.ok(group.length >= 10, `expected all repair rows, got ${group.length}`);
  assert.ok(group.every(event => event.actor === "بابام"), "all repair rows inherit the named person");
  assert.ok(group.every(event => event.odometerKm === 431503));
  assert.equal(group.find(event => event.componentKey === "crankshaft_position_sensor")?.costRial, 12500000);
  assert.equal(group.find(event => event.componentKey === "crankshaft_sensor_wiring")?.costRial, 2500000);
  assert.equal(group.find(event => event.componentKey === "power_steering_fluid")?.costRial, null, "labor must not be attached to the hydraulic fluid replacement");
  assert.ok(!group.some(event => event.componentKey === "gearbox_oil_leak"), "an unresolved leak is an issue, not a replaced component");
  assert.equal(group.find(event => event.title === "اجرت تعمیرگاه")?.costRial, 15000000);
  assert.equal(group.find(event => event.type === "issue" && event.symptom === "نشتی روغن هیدرولیک")?.status, "fixed");
  assert.equal(group.find(event => event.type === "issue" && event.symptom === "نشتی روغن گیربکس / واسکازین")?.status, "open");
  assert.equal(group.find(event => event.type === "issue" && event.symptom === "روشن نشدن خودرو")?.status, "fixed");
 } finally { globalThis.fetch = originalFetch; }
});

test("natural self car wash is recorded as a wash and keeps the default actor", async () => {
 const token = "w".repeat(64);
 const config = JSON.parse(readFileSync(new URL("./fixtures/config.fixture.json", import.meta.url), "utf8"));
 const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: [month] })],
  ["data/config.json", JSON.stringify(config)],
  [`data/logs/${month}.json`, JSON.stringify({ schemaVersion: 1, month, events: [{ id: "wash-prior-odo-0001", type: "odometer", title: "کیلومتری قبل", description: "قرائت معتبر", actor: "من", occurredAt: new Date(Date.now()-86400000).toISOString(), date: month+"-01", odometerKm: 431503, createdAt: new Date(Date.now()-86400000).toISOString() }] })]
 ]);
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (!url.hostname.includes("api.github.com")) return new Response("unexpected upstream", { status: 500 });
  const path = url.pathname.split("/contents/")[1].split("/").map(decodeURIComponent).join("/");
  if ((init.method || "GET").toUpperCase() === "GET") { const value=files.get(path); if(value===undefined)return new Response("not found",{status:404}); return new Response(JSON.stringify({sha:`sha-${path}`,content:Buffer.from(value,"utf8").toString("base64")}),{status:200}); }
  if (init.method === "PUT") { const body=JSON.parse(init.body); files.set(path,Buffer.from(body.content,"base64").toString("utf8")); return new Response(JSON.stringify({content:{path}}),{status:201}); }
  return new Response("method",{status:500});
 };
 try {
  const response=await worker.fetch(new Request("https://unit.test/api/v1/record",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({text:"ماشین را خودم شستم"})}),{API_ACCESS_TOKEN:token,GITHUB_TOKEN:"fake",GITHUB_OWNER:"mehrdadmb2",GITHUB_REPO:"peugeot-206-garage",GITHUB_BRANCH:"main"});
  assert.equal(response.status,200); const body=await response.json(); assert.equal(body.persisted,true,body.reply);
  const log=JSON.parse(files.get(`data/logs/${month}.json`)); const wash=log.events.find(event=>event.type==="wash");
  assert.ok(wash); assert.equal(wash.actor,"من"); assert.equal(wash.odometerKm,431503); assert.equal(wash.odometerAutoAssigned,true);
 } finally {globalThis.fetch=originalFetch;}
});


test("/interval can set a per-component lifetime and a maintenance note, and due reports include catalog service entries", async () => {
 const config = JSON.parse(readFileSync(new URL("./fixtures/config.fixture.json", import.meta.url), "utf8"));
 const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
 const prior = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
 const files = new Map([
  ["data/index.json", JSON.stringify({ schemaVersion: 1, updatedAt: null, months: [month] })],
  ["data/config.json", JSON.stringify(config)],
  [`data/logs/${month}.json`, JSON.stringify({ schemaVersion: 1, month, events: [
   { id: "service-key-test-0001", type: "service", title: "سرویس دیاگ", description: "دیاگ انجام شد", serviceCatalogKey: "engine_diagnostics", componentName: "دیاگ و عیب‌یابی موتور", occurredAt: `${prior}T10:00:00+03:30`, date: prior, time: "10:00", odometerKm: 431000, createdAt: `${prior}T06:30:00.000Z` },
   { id: "service-key-test-0002", type: "odometer", title: "کیلومتری فعلی", description: "قرائت", occurredAt: new Date().toISOString(), date: month + "-28", odometerKm: 431600, createdAt: new Date().toISOString() }
  ] })]
 ]);
 const timeline = [], restoreFetch = mockContentsApi(files, timeline, []);
 const token = "i".repeat(64);
 const env = { API_ACCESS_TOKEN: token, GITHUB_TOKEN: "fake-github-token", GITHUB_OWNER: "mehrdadmb2", GITHUB_REPO: "peugeot-206-garage", GITHUB_BRANCH: "main" };
 try {
  let response = await worker.fetch(new Request("https://unit.test/api/v1/record", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "/interval شمع موتور 20000 730 | توضیح: شمع نصب‌شده را پس از بدکارکردن بازدید کن" }) }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.reply, /بازهٔ نگهداری ذخیره شد/);
  let savedConfig = JSON.parse(files.get("data/config.json"));
  assert.equal(savedConfig.serviceIntervals.spark_plugs.intervalKm, 20000);
  assert.equal(savedConfig.serviceIntervals.spark_plugs.intervalDays, 730);
  assert.match(savedConfig.serviceIntervals.spark_plugs.note, /بدکارکردن/);

  response = await worker.fetch(new Request("https://unit.test/api/v1/record", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "/maintnote spark_plugs | توضیح شخصی: برای بررسی بعد از سرویس، شمارهٔ قطعه ثبت شود" }) }), env);
  assert.equal(response.status, 200);
  savedConfig = JSON.parse(files.get("data/config.json"));
  assert.match(savedConfig.serviceIntervals.spark_plugs.note, /شمارهٔ قطعه ثبت شود/);

  response = await worker.fetch(new Request("https://unit.test/api/v1/record", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "/interval engine_diagnostics 5000 30" }) }), env);
  assert.equal(response.status, 200);
  savedConfig = JSON.parse(files.get("data/config.json"));
  assert.equal(savedConfig.serviceIntervals.engine_diagnostics.intervalDays, 30);

  response = await worker.fetch(new Request("https://unit.test/api/v1/due", { headers: { authorization: `Bearer ${token}` } }), env);
  assert.equal(response.status, 200);
  const due = await response.json();
  assert.ok(Array.isArray(due.dueItems));
  assert.ok(due.dueItems.some(item => item.key === "engine_diagnostics" && item.overdue), "custom intervals should attach to the most recent serviceCatalogKey and drive reminders");
 } finally { restoreFetch(); }
});

test("maintenance page implementation supports dynamic cards for unconfigured service catalog entries and elapsed distance/day details", () => {
 const app = readFileSync(new URL("../../assets/js/app.js", import.meta.url), "utf8");
 assert.match(app, /function renderDynamicMaintenanceCards/);
 assert.match(app, /serviceCatalogKey/);
 assert.match(app, /روز گذشته/);
 assert.match(app, /از آن زمان/);
 assert.match(app, /maintenanceOverrides/);
});
