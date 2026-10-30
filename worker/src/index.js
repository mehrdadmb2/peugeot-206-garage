const API_VERSION = "2022-11-28";
const TZ = "Asia/Tehran";
const FILE_INDEX = "data/index.json";
const FILE_CONFIG = "data/config.json";
const FILE_REMINDERS = "data/reminder-state.json";
const FILE_DELETED_EVENTS = "data/deleted-events.json";
const FILE_PENDING_DUPLICATES = "data/pending-duplicates.json";
const FILE_PENDING_REVIEWS = "data/pending-reviews.json";
const FILE_PENDING_ANOMALIES = "data/pending-anomaly-reviews.json";
const PRIVATE_VEHICLE_DOCS_KEY = "vehicle-documents:v1";
const PRIVATE_DOC_REMINDER_KEY = "vehicle-document-expiry-reminders:v1";
const DEFAULT_PURCHASE_ODOMETER_KM = 428000;
const QUICKCHART_URL = "https://quickchart.io/chart";
const SITE_URL = "https://mehrdadmb2.github.io/peugeot-206-garage/";
const BOT_URL = "https://t.me/Peugeot206GarageBot";

const SERVICE_ALIASES = {
  engine_oil: ["engine_oil", "oil", "روغن موتور", "روغن موتور ماشین", "روغن", "موتور", "engine oil", "motor oil"],
  oil_filter: ["oil_filter", "فیلتر روغن", "فیلترروغن", "oil filter"],
  air_filter: ["air_filter", "فیلتر هوا", "فیلترهوا", "air filter"],
  cabin_filter: ["cabin_filter", "فیلتر کابین", "فیلتر اتاق", "cabin filter"],
  fuel_filter: ["fuel_filter", "فیلتر بنزین", "فیلتر سوخت", "fuel filter"],
  spark_plugs: ["spark_plugs", "شمع", "شمع موتور", "spark plug", "spark plugs"],
  timing_belt: ["timing_belt", "تسمه تایم", "تسمه‌تایم", "تسمه تایمینگ", "تسمه تایم موتور", "timing belt"],
  alternator_belt: ["alternator_belt", "تسمه دینام", "تسمه آلترناتور", "تسمه تجهیزات جانبی", "alternator belt", "accessory belt"],
  gearbox_oil: ["gearbox_oil", "روغن گیربکس", "روغن واسکازین", "واسکازین", "روغن جعبه دنده", "gearbox oil", "transmission oil"],
  power_steering_fluid: ["power_steering_fluid", "روغن هیدرولیک", "روغن هیدرولیک فرمان", "روغن فرمان", "power steering fluid"],
  coolant_temp_sensor: ["coolant_temp_sensor", "فشنگی آب", "سنسور دمای آب", "فشنگی دمای آب"],
  crankshaft_position_sensor: ["crankshaft_position_sensor", "سنسور دور موتور", "سنسور موقعیت میل لنگ", "سنسور میل لنگ", "crankshaft sensor"],
  crankshaft_sensor_wiring: ["crankshaft_sensor_wiring", "سیم سنسور دور موتور", "کابل سنسور دور موتور", "سوکت سنسور دور موتور"],
  coolant: ["coolant", "ضدیخ", "ضد یخ", "مایع خنک کننده", "آب رادیاتور", "coolant"],
  brake_fluid: ["brake_fluid", "روغن ترمز", "brake fluid"],
  brake_inspection: ["brake_inspection", "بازدید ترمز", "لنت", "ترمز", "brake inspection"],
  tyre_inspection: ["tyre_inspection", "tire_inspection", "لاستیک", "باد لاستیک", "فشار باد", "tyre"],
  battery_check: ["battery_check", "باتری", "باطری", "battery"]
};

const SERVICE_START_WORDS = ["تعویض", "عوض کردم", "عوض شد", "عوضش کردم", "سرویس کردم", "سرویس شد", "بررسی کردم", "بازدید کردم", "چک کردم", "تعویض کردم"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) return corsResponse(new Response(null, { status: 204 }));

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/api")) {
      return json({
        ok: true,
        service: "206 Garage API",
        version: "3.14.0",
        timezone: TZ,
        mode: "request-driven",
        dashboard: SITE_URL,
        telegram: BOT_URL,
        writes: "GitHub Contents API commits are awaited before a successful response; scheduled reminders are triggered by GitHub Actions.",
        endpoints: {
          health: "GET /health",
          telegramWebhook: "POST /telegram",
          record: "POST /api/v1/record (Authorization: Bearer <API_ACCESS_TOKEN>, JSON {text:'...' } or typed event)",
          overview: "GET /api/v1/overview (authorized)",
          events: "GET /api/v1/events?month=YYYY-MM&type=fuel&limit=100 (authorized)",
          due: "GET /api/v1/due (authorized)",
          config: "GET /api/v1/config (authorized)",
          export: "GET /api/v1/export?month=YYYY-MM or month=all (authorized CSV)",
          purchaseOdometer: "POST /api/v1/record with text /purchasekm 428000 (authorized)",
          scheduledReminders: "POST /scheduled/reminders (X-Schedule-Secret; called by GitHub Actions once daily)",
          analysis: "Telegram /analysis hour|day|week|month sends PNG charts and a detailed report",
          updateEvent: "POST /api/v1/event/update (authorized JSON {id, patch})",
          deleteEvent: "DELETE /api/v1/event?id=<event-id> (authorized; archived before removal)",
          privateDocuments: "GET /api/private/documents (Authorization: Bearer <DOCUMENTS_ACCESS_TOKEN>); POST /api/private/documents/insurance (private vehicle document vault)"
        }
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "206 Garage API", version: "3.14.0", time: nowTehran().iso, timezone: TZ, mode: "request-driven", configured: {
        telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET && env.ALLOWED_TELEGRAM_USER_ID),
        github: Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO),
        externalApi: Boolean(env.API_ACCESS_TOKEN),
        privateDocuments: Boolean(env.DOCUMENTS_ACCESS_TOKEN && env.GARAGE_PRIVATE_KV)
      }, scheduler: "GitHub Actions calls /scheduled/reminders daily; no Worker cron required", scheduledReminders: String(env.SCHEDULE_TRIGGER_SECRET || "").length >= 32 });
    }
    if (url.pathname === "/scheduled/reminders" && request.method === "POST") {
      const expected = String(env.SCHEDULE_TRIGGER_SECRET || "");
      const supplied = String(request.headers.get("X-Schedule-Secret") || "");
      if (expected.length < 32) return json({ ok: false, error: "schedule_secret_not_configured", message: "Set SCHEDULE_TRIGGER_SECRET in Cloudflare Worker secrets. It must contain at least 32 characters." }, 503);
      if (!constantTimeEqual(supplied, expected)) return json({ ok: false, error: "forbidden", reason: "schedule_secret_mismatch", message: "The GitHub Actions SCHEDULE_TRIGGER_SECRET must exactly match the Cloudflare Worker SCHEDULE_TRIGGER_SECRET." }, 403);
      try {
        const result = await runDueReminders(env);
        return json({ ok: true, trigger: "github-actions", time: nowTehran().iso, ...result });
      } catch (error) {
        console.error("scheduled reminders failed", error?.stack || error);
        return json({ ok: false, error: "reminders_failed", message: safePublicError(error) }, 500);
      }
    }
    if (url.pathname === "/telegram" && request.method === "POST") {
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      let update;
      try { update = await request.json(); }
      catch { return new Response("invalid json", { status: 400 }); }
      // Acknowledge Telegram immediately. Multi-event workshop messages may write many
      // GitHub files; waitUntil keeps processing alive and avoids Telegram webhook retries.
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(processTelegramWebhook(update, env).catch(error => console.error("telegram background processing failed", error?.stack || error)));
        return json({ ok: true, accepted: true, processing: "background" });
      }
      await processTelegramWebhook(update, env);
      return json({ ok: true, accepted: true, processing: "complete" });
    }
    if (url.pathname === "/api/private/documents" || url.pathname === "/api/private/documents/insurance") {
      if (!isPrivateDocumentsAuthorized(request, env)) return corsResponse(json({ ok: false, error: "documents_unauthorized", message: "برای دسترسی به مدارک، DOCUMENTS_ACCESS_TOKEN را وارد کن." }, 401));
      try {
        if (!env.GARAGE_PRIVATE_KV) return corsResponse(json({ ok: false, error: "private_kv_not_configured", message: "فضای خصوصی Cloudflare KV با binding به نام GARAGE_PRIVATE_KV هنوز تنظیم نشده است." }, 503));
        if (request.method === "GET" && url.pathname === "/api/private/documents") {
          const documents = await loadPrivateVehicleDocuments(env);
          return corsResponse(json({ ok: true, documents, storage: "cloudflare-kv-private", cache: "no-store" }));
        }
        if (request.method === "POST" && url.pathname === "/api/private/documents/insurance") {
          let payload;
          try { payload = await request.json(); } catch { return corsResponse(json({ ok: false, error: "invalid_json" }, 400)); }
          const issueDateJalali = normalizeJalaliInput(payload?.issueDateJalali);
          const expiryDateJalali = normalizeJalaliInput(payload?.expiryDateJalali);
          if (!isValidJalaliDate(issueDateJalali) || !isValidJalaliDate(expiryDateJalali)) return corsResponse(json({ ok: false, error: "invalid_insurance_dates", message: "تاریخ‌ها باید با قالب سال/ماه/روز شمسی معتبر وارد شوند؛ نمونه: ۱۴۰۵/۰۱/۰۱." }, 400));
          const issueParts = issueDateJalali.split("/").map(Number);
          const expiryParts = expiryDateJalali.split("/").map(Number);
          const issue = jalaliToGregorian(...issueParts);
          const expiry = jalaliToGregorian(...expiryParts);
          if (Date.UTC(...[expiry[0], expiry[1]-1, expiry[2]]) < Date.UTC(...[issue[0], issue[1]-1, issue[2]])) return corsResponse(json({ ok: false, error: "insurance_expiry_before_issue", message: "تاریخ انقضا نمی‌تواند قبل از تاریخ صدور باشد." }, 400));
          const documents = await loadPrivateVehicleDocuments(env);
          documents.insurance = {
            ...(documents.insurance || {}), status: "configured", policyType: "شخص ثالث",
            provider: cleanPrivateField(payload.provider, 100), policyNumber: cleanPrivateField(payload.policyNumber, 100),
            insuredName: cleanPrivateField(payload.insuredName, 120), issueDateJalali, expiryDateJalali,
            thirdPartyCoverage: cleanPrivateField(payload.thirdPartyCoverage, 100), bodyCoverage: cleanPrivateField(payload.bodyCoverage, 100),
            updatedAt: nowTehran().iso
          };
          documents.updatedAt = nowTehran().iso;
          await savePrivateVehicleDocuments(env, documents);
          return corsResponse(json({ ok: true, documents, savedTo: "cloudflare-kv-private", reminders: { thresholdsDays: [30, 14, 7, 0] } }));
        }
        return corsResponse(json({ ok: false, error: "method_not_allowed" }, 405));
      } catch (error) {
        console.error("private vehicle documents request failed", error?.stack || error);
        return corsResponse(json({ ok: false, error: "private_documents_failed", message: safePublicError(error) }, 500));
      }
    }
    if (url.pathname.startsWith("/api/v1/")) {
      if (!isApiAuthorized(request, env)) return corsResponse(json({ ok: false, error: "unauthorized", message: "Set the API_ACCESS_TOKEN Worker secret and send it as Authorization: Bearer <token>." }, 401));
      try {
        const result = await handleExternalApi(request, url, env);
        return corsResponse(result);
      } catch (error) {
        console.error("external api request failed", error?.stack || error);
        return corsResponse(json({ ok: false, error: "request_failed", message: safePublicError(error) }, 500));
      }
    }
    return json({ ok: false, error: "not_found", hint: "Open / or /api for the API guide." }, 404);
  }
};

function isApiAuthorized(request, env) {
  const expected = String(env.API_ACCESS_TOKEN || "");
  if (expected.length < 24) return false;
  const header = request.headers.get("Authorization") || "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1] || request.headers.get("X-API-Token") || "";
  if (bearer.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= bearer.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function corsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Token");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function safePublicError(error) {
  const message = String(error?.message || "Unknown error");
  if (/token|authorization|bearer|secret/i.test(message)) return "Check Worker secrets and GitHub repository permissions.";
  return message.slice(0, 260);
}

async function handleExternalApi(request, url, env) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "GET" && path === "/api/v1/health") return json({ ok: true, time: nowTehran().iso, timezone: TZ, mode: "request-driven" });
  if (request.method === "GET" && path === "/api/v1/overview") {
    const [events, config, index] = await Promise.all([loadAllEvents(env), readConfig(env), readJsonFile(FILE_INDEX, env, { months: [], updatedAt: null })]);
    const currentOdo = calculateCurrentOdometer(events);
    const currentMonth = nowTehran().date.slice(0, 7);
    const monthEvents = events.filter(e => String(e.date || e.occurredAt || "").slice(0, 7) === currentMonth);
    const actualCosts = events.filter(e => Number(e.costRial) > 0 && (e.type !== "fine" || Boolean(e.paid)));
    const unpaidFines = events.filter(e => e.type === "fine" && !e.paid);
    const openIssues = events.filter(e => e.type === "issue" && e.status !== "fixed");
    const due = calculateDueItems(events, config, currentOdo, nowTehran());
    const fines = events.filter(e => e.type === "fine");
    const ownership = getOwnershipSettings(config);
    const ownershipDrivenKm = currentOdo !== null && currentOdo >= ownership.purchaseOdometerKm ? currentOdo - ownership.purchaseOdometerKm : null;
    const paidFineRial = fines.filter(e => e.paid).reduce((n,e)=>n+(Number(e.costRial)||0),0);
    return json({ ok: true, vehicle: config.vehicle || {}, ownership, ownershipDrivenKm, timezone: TZ, updatedAt: index.updatedAt || null, eventCount: events.length, currentOdometerKm: currentOdo, currentMonth, currentMonthEventCount: monthEvents.length, totalCostRial: actualCosts.reduce((n,e)=>n+(Number(e.costRial)||0),0), currentMonthCostRial: actualCosts.filter(e => accountingDateForApi(e).slice(0,7) === currentMonth).reduce((n,e)=>n+(Number(e.costRial)||0),0), currentMonthFuelLiters: monthEvents.filter(e=>e.type === "fuel").reduce((n,e)=>n+(Number(e.liters)||0),0), totalFineCount: fines.length, totalFineRial: fines.reduce((n,e)=>n+(Number(e.costRial)||0),0), paidFineRial, unpaidFineCount: unpaidFines.length, unpaidFineRial: unpaidFines.reduce((n,e)=>n+(Number(e.costRial)||0),0), openIssueCount: openIssues.length, dueItems: due, months: index.months || [] });
  }
  if (request.method === "GET" && path === "/api/v1/events") {
    const month = url.searchParams.get("month");
    const type = url.searchParams.get("type");
    const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get("limit")) || 500));
    let events = month ? (await getMonth(month, env)).events || [] : await loadAllEvents(env);
    if (type && type !== "all") events = events.filter(e => e.type === type);
    if (url.searchParams.get("order") === "asc") events.sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt)));
    else events.sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)));
    return json({ ok: true, count: events.length, returned: Math.min(events.length, limit), month: month || null, type: type || "all", events: events.slice(0, limit) });
  }
  if (request.method === "GET" && path === "/api/v1/due") {
    const [events, config] = await Promise.all([loadAllEvents(env), readConfig(env)]);
    return json({ ok: true, currentOdometerKm: calculateCurrentOdometer(events), dueItems: calculateDueItems(events, config, calculateCurrentOdometer(events), nowTehran()), caveat: "Configured intervals are reminders, not a replacement for the vehicle manual or a mechanic's inspection." });
  }
  if (request.method === "GET" && path === "/api/v1/config") return json({ ok: true, config: await readConfig(env) });
  if (request.method === "GET" && path === "/api/v1/export") {
    const month = url.searchParams.get("month") || nowTehran().date.slice(0, 7);
    const events = /^(all|همه|کل)$/i.test(month) ? await loadAllEvents(env) : (await getMonth(month, env)).events || [];
    const csv = eventsToCsv(events);
    return new Response("\uFEFF" + csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="206-garage-${month}.csv"`, "cache-control": "no-store" } });
  }
  if (request.method === "POST" && path === "/api/v1/event/update") {
    let payload;
    try { payload = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    if (!payload || typeof payload.id !== "string" || !payload.patch || typeof payload.patch !== "object" || Array.isArray(payload.patch)) return json({ ok: false, error: "invalid_payload", example: { id: "event-id-prefix", patch: { actor: "بابام", note: "سفر جاده‌ای" } } }, 400);
    const allowed = new Set(["title", "description", "actor", "note", "odometerKm", "distanceKm", "liters", "costRial", "paid", "paidAt", "status"]);
    const patch = Object.fromEntries(Object.entries(payload.patch).filter(([key]) => allowed.has(key)));
    for (const key of ["title", "description", "actor", "note"]) if (patch[key] !== undefined) patch[key] = String(patch[key]).slice(0, 2000);
    for (const key of ["odometerKm", "distanceKm", "liters", "costRial"]) if (patch[key] !== undefined) { const n = Number(patch[key]); if (!Number.isFinite(n) || n < 0) return json({ ok: false, error: "invalid_numeric_field", field: key }, 400); patch[key] = n; }
    if (!Object.keys(patch).length) return json({ ok: false, error: "empty_patch" }, 400);
    const result = await mutateEventByPrefix(payload.id, patch, env, "api");
    if (result.error) return json({ ok: false, error: "event_update_failed", message: result.error }, 404);
    return json({ ok: true, event: result.event });
  }
  if (request.method === "DELETE" && path === "/api/v1/event") {
    const id = url.searchParams.get("id") || "";
    const result = await deleteEventByPrefix(id, env, "api");
    return result.event ? json({ ok: true, deletedId: result.event.id, archived: true }) : json({ ok: false, error: "delete_failed", message: result.text }, 404);
  }
  if (request.method === "POST" && (path === "/api/v1/record" || path === "/api/v1/command")) {
    let payload;
    try { payload = await request.json(); } catch { return json({ ok: false, error: "invalid_json", message: "Send a JSON object." }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ ok: false, error: "invalid_payload" }, 400);
    let reply;
    if (typeof (payload.text ?? payload.message) === "string") {
      const text = String(payload.text ?? payload.message).trim();
      if (!text) return json({ ok: false, error: "empty_text" }, 400);
      const fakeMessage = { date: Math.floor(Date.now()/1000), from: { id: "external-api" }, chat: { id: "external-api" } };
      reply = await processMessage(text, fakeMessage, env);
    } else if (typeof payload.type === "string") {
      const allowed = new Set(["odometer","trip","fuel","service","part","expense","fine","wash","issue","repair","note"]);
      if (!allowed.has(payload.type)) return json({ ok: false, error: "unsupported_event_type", allowed: [...allowed] }, 400);
      const input = { ...payload, type: payload.type, title: String(payload.title || eventTypeLabel(payload.type)), description: String(payload.description || "External API event").slice(0,2000), actor: payload.actor === undefined || payload.actor === null ? "" : String(payload.actor).slice(0,100), note: String(payload.note || "").slice(0,2000), occurredAt: payload.occurredAt || nowTehran().iso };
      for (const key of ["odometerKm","distanceKm","liters","costRial"]) if (input[key] !== undefined && input[key] !== null) {
        const n = Number(input[key]); if (!Number.isFinite(n) || n < 0) return json({ ok: false, error: "invalid_numeric_field", field: key }, 400); input[key] = n;
      }
      reply = { text: await saveEvent(input, env) };
    } else return json({ ok: false, error: "missing_text_or_type", example: { text: "20l بنزین زدم، هزینه 700 هزار تومان، کیلومتر 156200" } }, 400);
    // State-changing commands have completed their GitHub Contents API writes before processMessage/saveEvent resolves.
    const replyText = String(reply?.text || "درخواست پردازش شد.");
    const persisted = /✅ ثبت شد:|چند مورد سرویس از پیام تشخیص داده شد و جداگانه ثبت شد|بازه .+ ذخیره شد|پرداخت جریمه ثبت شد|خرابی بسته شد|مراجعه و تعمیر چندبخشی ثبت شد|ثبت سرویس:|ثبت\/تعویض قطعه/i.test(replyText);
    if (reply?.document) return json({ ok: false, error: "use_csv_endpoint", message: "برای دریافت CSV از GET /api/v1/export?month=YYYY-MM استفاده کن." }, 400);
    return json({ ok: true, persisted, source: "github", reply: replyText, filename: reply?.filename || null, note: "در رویدادهای تغییردهنده، پاسخ موفق پس از پایان commitهای GitHub ارسال می‌شود؛ گزارش‌ها فقط داده‌های ذخیره‌شده را می‌خوانند." });
  }
  return json({ ok: false, error: "not_found", allowed: ["GET /api/v1/overview","GET /api/v1/events","GET /api/v1/due","GET /api/v1/config","GET /api/v1/export","GET /api/private/documents","POST /api/private/documents/insurance","POST /api/v1/record","POST /api/v1/event/update","DELETE /api/v1/event?id=EVENT_ID"] }, 404);
}

function accountingDateForApi(event) {
  return String(event.type === "fine" && event.paid && event.paidAt ? event.paidAt : event.type === "issue" && event.resolvedAt && Number(event.repairCostRial) > 0 ? event.resolvedAt : event.occurredAt || event.date || "");
}

async function processTelegramWebhook(update, env) {
  const message = update?.message;
  let acknowledgementSent = false;
  try {
    // Send receipt before the first GitHub round-trip. Workshop jobs can write many files,
    // and users should never need to resend simply because the repository API is slow.
    if (message && typeof message.text === "string" && message.chat?.id &&
        String(message.from?.id ?? "") === String(env.ALLOWED_TELEGRAM_USER_ID || "") &&
        looksLikeEventCreation(message.text)) {
      await sendText(env, message.chat.id, "📩 پیام دریافت شد. ابتدا تکراری‌بودن را بررسی می‌کنم و سپس نتیجهٔ ثبت را جداگانه می‌فرستم؛ لطفاً پیام را دوباره ارسال نکن.", false);
      acknowledgementSent = true;
    }
    if (message && typeof message.text === "string" && update?.update_id != null && looksLikeStateChange(message.text)) {
      if (!(await claimTelegramUpdate(update.update_id, env))) {
        console.info("duplicate Telegram update ignored", String(update.update_id));
        if (acknowledgementSent && message?.chat?.id) {
          await sendText(env, message.chat.id, "✅ این به‌روزرسانی قبلاً دریافت و پردازش شده است؛ دوباره ثبت نشد. اگر نتیجهٔ قبلی را نمی‌بینی، /latest و سپس /duplicates را بررسی کن.", false);
        }
        return;
      }
    }
    await handleTelegramUpdate(update, env, { acknowledgementSent });
  } catch (error) {
    console.error("telegram update processing failed", error?.stack || error);
    const chatId = message?.chat?.id;
    if (chatId && String(message?.from?.id ?? "") === String(env.ALLOWED_TELEGRAM_USER_ID || "")) {
      try { await sendText(env, chatId, "⚠️ پیام دریافت شد، اما پردازش کامل نشد. قبل از ارسال دوباره، /duplicates را بررسی کن؛ جزئیات فنی در Cloudflare Worker Logs است.", false); }
      catch (sendError) { console.error("telegram fallback response failed", sendError?.message || sendError); }
    }
  }
}

async function claimTelegramUpdate(updateId, env) {
  const id = String(updateId);
  const current = await readJsonFile(FILE_INDEX, env, { schemaVersion: 1, months: [] });
  if ((current.recentTelegramUpdateIds || []).includes(id)) return false;
  let claimed = false;
  await mutateJsonFile(FILE_INDEX, env, () => ({ schemaVersion: 1, months: [] }), value => {
    value.recentTelegramUpdateIds = Array.isArray(value.recentTelegramUpdateIds) ? value.recentTelegramUpdateIds : [];
    if (value.recentTelegramUpdateIds.includes(id)) return value;
    value.recentTelegramUpdateIds.push(id);
    value.recentTelegramUpdateIds = value.recentTelegramUpdateIds.slice(-250);
    value.updatedAt = nowTehran().iso;
    claimed = true;
    return value;
  });
  return claimed;
}

function looksLikeStateChange(text) {
  const value = normalizeIntentText(text);
  if (/^\/(?:km|odo|trip|fuel|service|part|interval|wash|fine|paid|payfine|repair|fixed|expense|note|repairjob|workshop|purchasekm|people|edit|annotate|actor|delete|restore|revise)\b/i.test(value)) return true;
  return /(?:تعویض|عوض شد|تعمیر شد|دیاگ|هواگیری|خراب|روشن.{0,10}(?:نمی.{0,5}(?:شود|شه|زند)|نشد)|استارت.{0,10}(?:نمی.{0,5}(?:خورد|زنه|زند)|نخورد)|باتری.{0,12}(?:خوابیده|خالی|ضعیف)|جریمه|سوخت.?گیری|بنزین زدم|هزینه.*تومان|کیلومتر\s*\d{4,6}|کارکرد\s*\d{4,6})/i.test(value);
}

function looksLikeEventCreation(text) {
  const value = normalizeIntentText(text);
  if (/^\/(?:km|odo|trip|fuel|service|part|wash|fine|repairjob|workshop|expense|note)\b/i.test(value)) return true;
  if (/^\//.test(value)) return false;
  return /(?:روشن.{0,10}(?:نمی.{0,5}(?:شود|شه|زند)|نشد)|استارت.{0,10}(?:نمی.{0,5}(?:خورد|زنه|زند)|نخورد)|باتری.{0,12}(?:خوابیده|خالی|ضعیف)|خراب|برد.*تعمیرگاه|تعمیرگاه|تعویض|عوض شد|دیاگ|هواگیری|سوخت.?گیری|بنزین|جریمه|کارواش|شستم|شست.?وشو|نشتی|روغن|واکس|یادداشت:|هزینه.*تومان|کیلومتر\s*\d{4,6}|کارکرد\s*\d{4,6})/i.test(value);
}

async function fingerprintText(value) {
  const normalized = normalizeIntentText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!normalized) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function findMessageDuplicate(text, env) {
  const raw = String(text || "").trim();
  const candidates = [raw, raw.replace(/^\/[^\s@]+(?:@[^\s]+)?\s*/, "").trim()].filter(Boolean);
  const fingerprints = new Set(await Promise.all(candidates.map(fingerprintText)));
  const matches = (await loadAllEvents(env)).filter(event => fingerprints.has(String(event.metadata?.messageFingerprint || "")));
  if (!matches.length) return null;
  matches.sort((a, b) => eventTimestampForReport(b) - eventTimestampForReport(a));
  return { event: matches[0], count: matches.length };
}

async function savePendingDuplicate(payload, env) {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const createdAt = nowTehran().iso;
  await mutateJsonFile(FILE_PENDING_DUPLICATES, env, () => ({ schemaVersion: 1, items: {} }), current => {
    current.items = current.items && typeof current.items === "object" ? current.items : {};
    const now = Date.now();
    for (const [key, item] of Object.entries(current.items)) if (!item?.createdAt || now - Date.parse(item.createdAt) > 86400000) delete current.items[key];
    current.items[token] = { ...payload, token, createdAt, expiresAt: now + 86400000 };
    const keys = Object.keys(current.items);
    for (const key of keys.slice(0, Math.max(0, keys.length - 25))) delete current.items[key];
    current.updatedAt = createdAt;
    return current;
  });
  return token;
}

async function consumePendingDuplicate(token, env) {
  let payload = null;
  await mutateJsonFile(FILE_PENDING_DUPLICATES, env, () => ({ schemaVersion: 1, items: {} }), current => {
    current.items = current.items && typeof current.items === "object" ? current.items : {};
    payload = current.items[token] || null;
    if (payload) delete current.items[token];
    current.updatedAt = nowTehran().iso;
    return current;
  });
  if (payload?.expiresAt && Number(payload.expiresAt) < Date.now()) return null;
  return payload;
}

function duplicateConfirmationKeyboard(token) {
  return { inline_keyboard: [[
    { text: "✅ با وجود تکرار ثبت کن", callback_data: `dupc:${token}:yes` },
    { text: "🚫 ثبت نکن", callback_data: `dupc:${token}:no` }
  ]] };
}

async function sendTelegramReply(reply, chatId, env) {
  // A report may contain both its searchable text and a visual document.
  // Send the text first so a failed attachment never hides the actual report.
  if (reply?.document) {
    if (reply.text) await sendText(env, chatId, reply.text, false);
    await sendDocument(env, chatId, reply.filename || "206-garage-document.svg", reply.document, reply.caption || "تصویر مدارک خودرو");
    return;
  }
  if (Array.isArray(reply?.photos)) {
    if (reply.text) await sendText(env, chatId, reply.text, false);
    for (const item of reply.photos) await sendPhoto(env, chatId, item.filename, item.blob, item.caption || "نمودار تحلیلی پژو ۲۰۶");
    return;
  }
  if (Array.isArray(reply?.messages)) {
    for (const item of reply.messages) await sendText(env, chatId, item.text, item.markup || false);
    return;
  }
  if (reply?.text) {
    const shortId = reply.eventId || eventIdFromReply(reply.text);
    const markup = reply.markup || (shortId ? eventActionKeyboard(shortId) : null);
    await sendText(env, chatId, reply.text, markup || reply.keyboard !== false);
  }
}

async function handleTelegramUpdate(update, env, options = {}) {
  if (update?.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
    return;
  }
  const message = update?.message;
  if (!message || typeof message.text !== "string") return;
  const senderId = String(message.from?.id ?? "");
  const chatId = message.chat?.id;
  if (!senderId || senderId !== String(env.ALLOWED_TELEGRAM_USER_ID || "")) {
    if (chatId) await sendText(env, chatId, "⛔ این ربات خصوصی است و اجازه استفاده برای این حساب فعال نیست.");
    return;
  }
  if (!chatId) return;
  const text = normalizeDigits(message.text.trim());
  try {
    if (looksLikeEventCreation(text)) {
      if (!options.acknowledgementSent) {
        await sendText(env, chatId, "📩 پیام دریافت شد. ابتدا تکراری‌بودن را بررسی می‌کنم و سپس نتیجهٔ ثبت را جداگانه می‌فرستم؛ لطفاً پیام را دوباره ارسال نکن.", false);
      }
      const duplicate = await findMessageDuplicate(text, env);
      if (duplicate) {
        const token = await savePendingDuplicate({ kind: "message", text: message.text, message: { date: message.date, message_id: message.message_id, text: message.text, from: { id: message.from?.id }, chat: { id: chatId } }, existingEventIds: [duplicate.event.id] }, env);
        await sendText(env, chatId, `🟡 <b>احتمال ثبت تکراری</b>\n\nاین پیام با سابقهٔ قبلی شباهت دقیق دارد. هیچ رویداد تازه‌ای ذخیره نشده است.\n\nعنوان قبلی: ${duplicate.event.title || eventTypeLabel(duplicate.event.type)}\nشناسهٔ قبلی: <code>${duplicate.event.id.slice(0,8)}</code>\nتاریخ: ${duplicate.event.jalaliDate || duplicate.event.date || "—"}\n\nاگر واقعاً عملیات جدیدی است، ثبت را تأیید کن؛ در غیر این صورت انصراف بده.`, duplicateConfirmationKeyboard(token));
        return;
      }
      const anomalies = await detectMessageAnomalies(text, env);
      if (anomalies.length) {
        const reviewToken = await savePendingAnomaly({ text: message.text, message: { date: message.date, message_id: message.message_id, text: message.text, from: { id: message.from?.id }, chat: { id: chatId } }, anomalies }, env);
        await sendText(env, chatId, formatAnomalyReview(anomalies, reviewToken), anomalyReviewKeyboard(reviewToken));
        return;
      }
    }
    const reply = await processMessage(text, message, env);
    await sendTelegramReply(reply, chatId, env);
  } catch (error) {
    console.error("message processing failed", error?.stack || error);
    const message = telegramFailureMessage(error);
    try {
      await sendText(env, chatId, message, false);
    } catch (notifyError) {
      console.error("telegram failure notification could not be delivered", notifyError?.stack || notifyError);
    }
  }
}

function telegramFailureMessage(error) {
  const detail = String(error?.message || error || "خطای ناشناخته");
  if (/Telegram sendDocument failed/i.test(detail)) {
    return "⚠️ گزارش متنی پردازش شد، اما تلگرام در دریافت فایل تصویری مدارک خطا داد. متن گزارش را در پیام قبلی می‌بینی؛ برای جزئیات، Worker Logs را بررسی کن. ممکن است نوع فایل یا محدودیت‌های Telegram Bot API علت باشد.";
  }
  if (/Telegram sendPhoto failed/i.test(detail)) {
    return "⚠️ تلگرام نتوانست تصویر را دریافت کند. داده‌های ثبت‌شده تغییر نکرده‌اند؛ جزئیات خطا در Worker Logs موجود است.";
  }
  if (/Telegram sendMessage failed|TELEGRAM_BOT_TOKEN/i.test(detail)) {
    return "⚠️ ارسال پیام به تلگرام ناموفق شد. مقدار Secret به نام TELEGRAM_BOT_TOKEN، فعال بودن ربات و پاسخ API تلگرام را بررسی کن. جزئیات فنی در Worker Logs ثبت شده است.";
  }
  if (/GARAGE_PRIVATE_KV/i.test(detail)) {
    return "🔐 فضای خصوصی مدارک در Worker متصل نیست. در Cloudflare بخش Settings → Bindings یک KV Namespace با نام Binding دقیق GARAGE_PRIVATE_KV متصل کن.";
  }
  if (/VEHICLE_DOCUMENTS_JSON|schema/i.test(detail)) {
    return "🔐 داده اولیه مدارک تنظیم نشده یا ساختار آن معتبر نیست. Secret با نام VEHICLE_DOCUMENTS_JSON و مقدار JSON مدارک را بررسی کن؛ داده‌های خصوصی را در مخزن عمومی قرار نده.";
  }
  if (/GitHub|Contents API|github\.com|GITHUB_TOKEN/i.test(detail)) {
    return "⚠️ خطا هنگام خواندن یا ذخیره سوابق در GitHub رخ داد. مقدار GITHUB_TOKEN، دسترسی Contents: Read and write و نام مخزن/Branch را بررسی کن. برای فرمان مدارک خصوصی، دسترسی KV نیز جداگانه لازم است.";
  }
  return `⚠️ عملیات کامل نشد. داده‌ها را دوباره ارسال نکن تا از ثبت تکراری جلوگیری شود. خطا: ${escapeTelegramText(safePublicError(error))}
جزئیات کامل در Worker Logs ثبت شده است.`;
}

async function handleCallbackQuery(query, env) {
  const senderId = String(query?.from?.id ?? "");
  const chatId = query?.message?.chat?.id;
  const callbackId = query?.id;
  if (senderId !== String(env.ALLOWED_TELEGRAM_USER_ID || "")) {
    await answerCallbackQuery(env, callbackId, "این ربات خصوصی است.", true);
    return;
  }
  const data = String(query?.data || "");
  const anomalyMatch = data.match(/^anom:([a-f0-9]{8}):(save|edit|cancel)$/i);
  if (anomalyMatch && chatId) {
    const [, token, decision] = anomalyMatch;
    await answerCallbackQuery(env, callbackId, decision === "save" ? "ثبت با تأیید انجام می‌شود." : decision === "edit" ? "متن را اصلاح کن." : "ثبت لغو شد.");
    const pending = decision === "edit" ? await getPendingAnomaly(token, env) : await consumePendingAnomaly(token, env);
    if (!pending) { await sendText(env, chatId, "⏳ درخواست بررسی منقضی شده یا قبلاً پردازش شده است.", false); return; }
    if (decision === "cancel") { await sendText(env, chatId, "✅ ثبت لغو شد؛ هیچ رویداد جدیدی ذخیره نشد.", false); return; }
    if (decision === "edit") { await sendText(env, chatId, `✏️ متن را اصلاح و با این قالب بفرست:
<code>/revise ${token} متن کامل اصلاح‌شده</code>
تا زمان تأیید، هیچ رویدادی از این درخواست ثبت نمی‌شود.`, false); return; }
    const duplicate = await findMessageDuplicate(pending.text, env);
    if (duplicate) {
      const dupeToken = await savePendingDuplicate({ kind: "message", text: pending.text, message: pending.message, existingEventIds: [duplicate.event.id] }, env);
      await sendText(env, chatId, `🟡 <b>پیش از ثبت تأییدشده، یک مورد مشابه پیدا شد.</b>
شناسه قبلی: <code>${duplicate.event.id.slice(0,8)}</code>
می‌خواهی با وجود شباهت ثبت شود؟`, duplicateConfirmationKeyboard(dupeToken));
      return;
    }
    const reply = await processMessage(pending.text, pending.message, env, { skipDuplicateChecks: true });
    await sendTelegramReply(reply, chatId, env);
    return;
  }
  if (data === "isslist:refresh" && chatId) {
    await answerCallbackQuery(env, callbackId, "در حال تازه‌سازی فهرست خرابی‌ها…");
    const reply = await openIssuesReport(env);
    await sendTelegramReply(reply, chatId, env);
    return;
  }
  const issueMatch = data.match(/^iss:([a-f0-9]{8}):(close|detail)$/i);
  if (issueMatch && chatId) {
    const [, id, action] = issueMatch;
    await answerCallbackQuery(env, callbackId, action === "close" ? "در حال بستن خرابی…" : "در حال دریافت جزئیات…");
    const event = await findEventByPrefix(id, env);
    if (!event || event.type !== "issue") { await sendText(env, chatId, "خرابی فعال با این شناسه پیدا نشد.", false); return; }
    if (action === "detail") { await sendText(env, chatId, formatEventDetails(event), eventActionKeyboard(event.id.slice(0,8))); return; }
    if (event.status === "fixed") { await sendText(env, chatId, `این خرابی قبلاً بسته شده است.
شناسه: <code>${event.id.slice(0,8)}</code>`, false); return; }
    const result = await mutateEventByPrefix(event.id, { status: "fixed", resolvedAt: nowTehran().iso, resolutionNote: "بسته‌شده از دکمه خرابی‌های باز در تلگرام" }, env, senderId);
    await sendText(env, chatId, result.error ? `❌ خرابی بسته نشد: ${result.error}` : `✅ خرابی بسته شد

<b>${escapeTelegramText(result.event.title || result.event.description || "خرابی")}</b>
شناسه: <code>${result.event.id.slice(0,8)}</code>
تاریخ بستن: ${jalaliDateLabel(nowTehran().date)}

برای مشاهده خرابی‌های باقی‌مانده: /issues`, false);
    return;
  }
  const pendingMatch = data.match(/^dupc:([a-f0-9]{8}):(yes|no)$/i);
  if (pendingMatch && chatId) {
    const [, token, decision] = pendingMatch;
    await answerCallbackQuery(env, callbackId, decision === "yes" ? "درخواست تأیید شد." : "ثبت لغو شد.");
    const pending = await consumePendingDuplicate(token, env);
    if (!pending) { await sendText(env, chatId, "⏳ درخواست تکراری منقضی شده یا قبلاً پردازش شده است.", false); return; }
    if (decision === "no") { await sendText(env, chatId, "✅ تأیید شد؛ عملیات جدیدی ثبت نشد. سوابق قبلی بدون تغییر ماندند.", false); return; }
    if (pending.kind === "message" && pending.text && pending.message) {
      const reply = await processMessage(pending.text, pending.message, env, { skipDuplicateChecks: true });
      await sendTelegramReply(reply, chatId, env);
      return;
    }
    await sendText(env, chatId, "درخواست تأیید قالب معتبری ندارد؛ هیچ داده‌ای اضافه نشد.", false);
    return;
  }
  const mergeMatch = data.match(/^dupmerge:([a-f0-9]{8}):([a-f0-9]{8})$/i);
  if (mergeMatch && chatId) {
    await answerCallbackQuery(env, callbackId, "در حال ادغام سوابق…");
    const result = await mergeDuplicateEvents(mergeMatch[1], mergeMatch[2], env, senderId);
    await sendText(env, chatId, result, false);
    return;
  }
  const deleteMatch = data.match(/^dupdelete:([a-f0-9]{8})$/i);
  if (deleteMatch && chatId) {
    await answerCallbackQuery(env, callbackId, "در حال بررسی…");
    const event = await findEventByPrefix(deleteMatch[1], env);
    if (!event) { await sendText(env, chatId, "رویداد فعال پیدا نشد.", false); return; }
    await sendText(env, chatId, `⚠️ حذف سابقهٔ احتمالی تکراری\\n\\n${formatEventDetails(event)}\\n\\nاین رویداد پس از تأیید به بایگانی منتقل می‌شود.`, deleteConfirmationKeyboard(event.id.slice(0,8)));
    return;
  }
  const match = data.match(/^evt:([a-f0-9-]{6,36}):(detail|edit|note|actor|delete|confirm|cancel)$/i);
  if (!match || !chatId) {
    await answerCallbackQuery(env, callbackId, "دکمه نامعتبر یا منقضی‌شده است.", true);
    return;
  }
  const [, id, action] = match;
  await answerCallbackQuery(env, callbackId, "در حال پردازش…");
  if (action === "cancel") {
    await sendText(env, chatId, "عملیات حذف لغو شد.");
    return;
  }
  if (action === "delete") {
    const event = await findEventByPrefix(id, env);
    if (!event) { await sendText(env, chatId, "رویداد پیدا نشد؛ شاید قبلاً حذف شده باشد."); return; }
    await sendText(env, chatId, `⚠️ تأیید حذف عملیات

${formatEventDetails(event)}

این کار رویداد را از دفتر فعال حذف می‌کند و یک نسخه در بایگانی نگه می‌دارد.`, deleteConfirmationKeyboard(event.id.slice(0, 8)));
    return;
  }
  if (action === "confirm") {
    const result = await deleteEventByPrefix(id, env, senderId);
    await sendText(env, chatId, result.text, false);
    return;
  }
  const event = await findEventByPrefix(id, env);
  if (!event) { await sendText(env, chatId, "رویداد پیدا نشد؛ شناسه را با /latest یا از داشبورد بررسی کن."); return; }
  if (action === "detail") {
    await sendText(env, chatId, formatEventDetails(event), eventActionKeyboard(event.id.slice(0, 8)));
  } else if (action === "edit") {
    await sendText(env, chatId, `✏️ ویرایش رویداد ${event.id.slice(0,8)}
هر فیلدی را با قالب زیر بفرست:
/edit ${event.id.slice(0,8)} عنوان=... | شرح=... | توضیح=... | شخص=... | مبلغ=... | کیلومتر=...
فقط فیلدهایی را بنویس که قصد تغییرشان را داری. مبلغ بدون واحد به تومان محسوب می‌شود.`, eventActionKeyboard(event.id.slice(0, 8)));
  } else if (action === "note") {
    await sendText(env, chatId, `📝 افزودن/تغییر توضیح
/annotate ${event.id.slice(0,8)} متن توضیح
برای پاک‌کردن توضیح از «-» استفاده کن.`, eventActionKeyboard(event.id.slice(0, 8)));
  } else if (action === "actor") {
    await sendText(env, chatId, `👤 تغییر شخص انجام‌دهنده
/actor ${event.id.slice(0,8)} نام شخص
مثال: /actor ${event.id.slice(0,8)} بابام
برای بازگرداندن به حالت پیش‌فرض بنویس: /actor ${event.id.slice(0,8)} من`, eventActionKeyboard(event.id.slice(0, 8)));
  }
}

function escapeTelegramText(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function issueActionKeyboard(id) {
  const short = String(id).slice(0,8);
  return { inline_keyboard: [
    [{ text: '✅ بستن خرابی', callback_data: `iss:${short}:close` }, { text: '🔎 جزئیات', callback_data: `iss:${short}:detail` }],
    [{ text: '🌐 داشبورد', url: SITE_URL }, { text: '📋 همه خرابی‌ها', callback_data: 'isslist:refresh' }]
  ] };
}
async function openIssuesReport(env) {
  const issues = (await loadAllEvents(env)).filter(e => e.type === 'issue' && e.status !== 'fixed').sort((a,b) => eventTimestampForReport(b)-eventTimestampForReport(a));
  if (!issues.length) return { text: '✅ خرابی باز ثبت‌شده‌ای وجود ندارد.\nاگر مشکلی باقی مانده، آن را با متن طبیعی ثبت کن؛ مثلاً «ماشین روشن نمی‌شود».', keyboard: false };
  const messages = issues.slice(0,15).map(event => ({
    text: `⚠️ <b>${escapeTelegramText(event.title || 'خرابی خودرو')}</b>\n<blockquote>${escapeTelegramText(event.description || 'شرح ثبت نشده')}</blockquote>\n👤 شخص: <code>${escapeTelegramText(event.actor || 'من')}</code>\n⌁ کیلومتر: <code>${event.odometerKm == null ? 'ثبت نشده' : `${formatNum(event.odometerKm)} km`}</code>\n📅 تاریخ: ${escapeTelegramText(event.jalaliDate || event.date || '—')}\n🧾 شناسه: <code>${escapeTelegramText(String(event.id).slice(0,8))}</code>\n${event.note ? `📝 توضیح: <blockquote>${escapeTelegramText(event.note)}</blockquote>\n` : ''}برای بستن، دکمه سبز را بزن.`,
    markup: issueActionKeyboard(event.id)
  }));
  return { messages: [{ text: `🧰 <b>خرابی‌های باز خودرو</b>\nتعداد: <code>${formatNum(issues.length)}</code>\n\nهر مورد در پیام جداگانه با دکمه بستن/جزئیات نمایش داده می‌شود.`, markup: false }, ...messages] };
}

function anomalyReviewKeyboard(token) {
  return { inline_keyboard: [
    [{ text: '✅ ثبت به هر حال', callback_data: `anom:${token}:save` }, { text: '✏️ ویرایش متن', callback_data: `anom:${token}:edit` }],
    [{ text: '🚫 لغو و عدم ثبت', callback_data: `anom:${token}:cancel` }]
  ] };
}
function formatAnomalyReview(anomalies, token) {
  return `🟠 <b>قبل از ثبت، چند مورد غیرعادی بررسی شود</b>\nهیچ رویداد جدیدی هنوز ذخیره نشده است.\n\n${anomalies.map((item, i) => `${i+1}. ${escapeTelegramText(item)}`).join('\n')}\n\nیکی از گزینه‌ها را انتخاب کن:\n• ثبت به هر حال\n• ویرایش متن با <code>/revise ${token} متن اصلاح‌شده</code>\n• لغو کامل ثبت\n\nاین هشدار جای تأیید دستی کیلومتر/مبلغ را نمی‌گیرد؛ ممکن است مقدار غیرعادی ولی واقعی باشد.`;
}
async function savePendingAnomaly(payload, env) {
  const token = crypto.randomUUID().replace(/-/g, '').slice(0,8);
  await mutateJsonFile(FILE_PENDING_ANOMALIES, env, () => ({ schemaVersion: 1, items: {} }), current => {
    current.items = current.items && typeof current.items === 'object' ? current.items : {};
    const now = Date.now();
    for (const [key, item] of Object.entries(current.items)) if (!item?.expiresAt || Number(item.expiresAt) < now) delete current.items[key];
    current.items[token] = { ...payload, token, createdAt: nowTehran().iso, expiresAt: now + 86400000 };
    for (const key of Object.keys(current.items).slice(0, Math.max(0, Object.keys(current.items).length - 25))) delete current.items[key];
    current.updatedAt = nowTehran().iso;
    return current;
  });
  return token;
}
async function getPendingAnomaly(token, env) {
  const current = await readJsonFile(FILE_PENDING_ANOMALIES, env, { items: {} });
  const item = current.items?.[token] || null;
  return item && Number(item.expiresAt) > Date.now() ? item : null;
}
async function consumePendingAnomaly(token, env) {
  let result = null;
  await mutateJsonFile(FILE_PENDING_ANOMALIES, env, () => ({ schemaVersion: 1, items: {} }), current => {
    current.items = current.items && typeof current.items === 'object' ? current.items : {};
    result = current.items[token] || null;
    if (result) delete current.items[token];
    current.updatedAt = nowTehran().iso;
    return current;
  });
  return result && Number(result.expiresAt) > Date.now() ? result : null;
}

async function detectMessageAnomalies(text, env) {
  const normalized = normalizeIntentText(text);
  const anomalies = [];
  const events = await loadAllEvents(env);
  const odoPattern = /^\/(?:km|odo|odometer)\b/i.test(text) || /(?:کیلومتر(?:شمار)?|کارکرد|\bkm\s*[=:]|\bodo(?:meter)?\b)/i.test(normalized);
  const newOdo = odoPattern ? (/^\/(?:km|odo|odometer)\b/i.test(text) ? parseFirstNumber(text.replace(/^\S+/, '')) : extractOdometer(text)) : null;
  if (Number.isFinite(newOdo) && newOdo > 0) {
    const odometers = events.filter(e => e.type === 'odometer' && Number.isFinite(Number(e.odometerKm))).sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)));
    const prior = odometers[0];
    if (prior) {
      const delta = Number(newOdo) - Number(prior.odometerKm);
      const elapsed = Math.abs(Date.parse(getOccurredAt(text, new Date()).iso) - Date.parse(prior.occurredAt || prior.createdAt || '')) / 86400000;
      if (delta < -5) anomalies.push(`کیلومتر جدید (${formatNum(newOdo)}) از آخرین قرائت (${formatNum(prior.odometerKm)}) کمتر است؛ اختلاف ${formatNum(Math.abs(delta))} km. ممکن است تایپی/اصلاحی باشد.`);
      else if (delta > 2500 || (delta > 1000 && Number.isFinite(elapsed) && elapsed < 2)) anomalies.push(`افزایش کیلومتر ${formatNum(delta)} km است${Number.isFinite(elapsed) ? ` در حدود ${formatNum(elapsed)} روز` : ''}؛ پیش از ثبت، رقم را بررسی کن.`);
    }
  }
  const liters = parseLiters(text);
  if (Number.isFinite(liters) && liters > 55) anomalies.push(`مقدار سوخت ${formatNum(liters)} لیتر است؛ برای جلوگیری از اشتباه در عدد/اعشار، باک و واحد را بررسی کن.`);
  const amount = extractMoneyRial(text);
  if (Number.isFinite(amount) && amount > 0) {
    const type = /جریمه|خلافی|قبض/i.test(normalized) ? 'fine' : /بنزین|سوخت|fuel|petrol/i.test(normalized) ? 'fuel' : /تعمیر|اجرت|مکانیک|repair/i.test(normalized) ? 'repair' : 'expense';
    const thresholds = { fuel: 100000000, fine: 1000000000, repair: 500000000, expense: 500000000 };
    if (amount > thresholds[type]) anomalies.push(`مبلغ ${formatMoneyToman(amount)} برای «${type === 'fine' ? 'جریمه' : type === 'fuel' ? 'سوخت‌گیری' : type === 'repair' ? 'تعمیر' : 'هزینه'}» بسیار بالا است؛ واحد تومان/ریال و تعداد صفرها را بررسی کن.`);
    const historical = events.filter(e => Number(e.costRial) > 0 && (type === 'fine' ? e.type === 'fine' : type === 'fuel' ? e.type === 'fuel' : type === 'repair' ? ['repair','issue','part','service'].includes(e.type) : ['expense','wash','part','service'].includes(e.type))).sort((a,b)=>eventTimestampForReport(b)-eventTimestampForReport(a)).slice(0,20).map(e=>Number(e.costRial)).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
    if (historical.length >= 4) {
      const median = historical.length % 2 ? historical[(historical.length-1)/2] : (historical[historical.length/2-1]+historical[historical.length/2])/2;
      if (amount > median * 4 && amount - median > 20000000) anomalies.push(`مبلغ ${formatMoneyToman(amount)} بیش از چهار برابر میانهٔ ثبت‌های مشابه اخیر است (${formatMoneyToman(median)}). بررسی کن که مبلغ درست وارد شده باشد.`);
    }
  }
  return anomalies;
}

async function reviseAnomalyMessage(text, message, env) {
  const match = String(text || '').match(/^\/revise\s+([a-f0-9]{8})\s+([\s\S]+)$/i);
  if (!match) return { text: 'قالب اصلاح پیام:\n<code>/revise TOKEN متن کامل اصلاح‌شده</code>\nTOKEN از پیام هشدار اولیه برداشته می‌شود؛ برای لغو، دکمه لغو را بزن.', keyboard: false };
  const [, token, revisedTextRaw] = match;
  const pending = await getPendingAnomaly(token, env);
  if (!pending) return { text: '⏳ درخواست اصلاح پیدا نشد یا منقضی شده است. پیام اصلی را دوباره بفرست.', keyboard: false };
  const revisedText = revisedTextRaw.trim();
  const duplicate = await findMessageDuplicate(revisedText, env);
  if (duplicate) {
    const dupeToken = await savePendingDuplicate({ kind: 'message', text: revisedText, message: { ...pending.message, text: revisedText, date: message?.date || pending.message?.date }, existingEventIds: [duplicate.event.id] }, env);
    await consumePendingAnomaly(token, env);
    return { text: `🟡 احتمال ثبت تکراری پس از اصلاح متن پیدا شد.\nشناسه قبلی: <code>${duplicate.event.id.slice(0,8)}</code>\nاگر عملیات جدیدی است تأیید کن.`, markup: duplicateConfirmationKeyboard(dupeToken) };
  }
  const anomalies = await detectMessageAnomalies(revisedText, env);
  const revisedMessage = { ...pending.message, text: revisedText, date: message?.date || pending.message?.date };
  if (anomalies.length) {
    await consumePendingAnomaly(token, env);
    const nextToken = await savePendingAnomaly({ text: revisedText, message: revisedMessage, anomalies }, env);
    return { text: formatAnomalyReview(anomalies, nextToken), markup: anomalyReviewKeyboard(nextToken) };
  }
  await consumePendingAnomaly(token, env);
  return await processMessage(revisedText, revisedMessage, env, { skipDuplicateChecks: true });
}

async function answerCallbackQuery(env, callbackId, text = "", showAlert = false) {
  if (!callbackId || !env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: String(text).slice(0, 180), show_alert: Boolean(showAlert) })
  }).catch(error => console.warn("answerCallbackQuery failed", error?.message || error));
}

function eventActionKeyboard(id) {
  const safeId = String(id).slice(0, 8);
  return { inline_keyboard: [
    [{ text: "🔎 جزئیات کامل", callback_data: `evt:${safeId}:detail` }],
    [{ text: "✏️ ویرایش", callback_data: `evt:${safeId}:edit` }, { text: "📝 توضیح", callback_data: `evt:${safeId}:note` }, { text: "👤 شخص", callback_data: `evt:${safeId}:actor` }],
    [{ text: "🗑 حذف عملیات", callback_data: `evt:${safeId}:delete` }],
    [{ text: "🌐 داشبورد", url: SITE_URL }, { text: "🤖 ربات", url: BOT_URL }]
  ] };
}
function deleteConfirmationKeyboard(id) {
  return { inline_keyboard: [[{ text: "🗑 بله، حذف شود", callback_data: `evt:${String(id).slice(0,8)}:confirm` }, { text: "انصراف", callback_data: `evt:${String(id).slice(0,8)}:cancel` }]] };
}
function eventIdFromReply(text) { return String(text || "").match(/شناسه\s*:\s*([a-f0-9-]{6,36})/i)?.[1] || null; }

const COMMAND_ALIASES = {
  catalog: "catalog", parts: "catalog", قطعات: "catalog", کاتالوگ: "catalog",
  documents: "documents", vehicle_documents: "documents", vehicledocuments: "documents", مدارک: "documents", مدارک_خودرو: "documents",
  insurance: "insurance", bime: "insurance", بیمه: "insurance",
  components: "components", installed: "components", قطعات_نصب: "components",
  issues: "issues", openissues: "issues", open_issues: "issues", خرابی: "issues", خرابیها: "issues", خرابی_ها: "issues",
  services: "services", servicecatalog: "services", فهرست_سرویس: "services",
  repairjob: "repairjob", workshop: "repairjob", تعمیرگاه: "repairjob", مراجعه: "repairjob",
  fineinfo: "fineinfo", جزئیات_جریمه: "fineinfo",
  start: "start", begin: "start", شروع: "start", help: "help", commands: "help", command: "help", راهنما: "help", کمک: "help", دستورها: "help",
  guide: "guide", manual: "guide", fullguide: "guide", راهنمای_کامل: "guide", دفترچه: "guide",
  analysis: "analysis", analytics: "analysis", charts: "analysis", نمودار: "analysis", تحلیل: "analysis",
  purchasekm: "purchasekm", purchase_km: "purchasekm", ownershipkm: "purchasekm", کیلومترخرید: "purchasekm", کیلومتر_خرید: "purchasekm",
  id: "id", شناسه: "id", km: "km", odo: "km", odometer: "km", mileage: "km", کارکرد: "km", کیلومتر: "km",
  trip: "trip", drive: "trip", distance: "trip", مسافت: "trip", سفر: "trip",
  fuel: "fuel", petrol: "fuel", gas: "fuel", refuel: "fuel", بنزین: "fuel", سوخت: "fuel",
  service: "service", maintenance: "service", سرویس: "service", part: "part", قطعه: "part",
  interval: "interval", reminder: "interval", بازه: "interval", فاصله: "interval",
  due: "due", upcoming: "due", service_due: "due", سرویسها: "due", سرویس_ها: "due", موعد: "due",
  summary: "summary", report: "summary", stats: "summary", گزارش: "summary", خلاصه: "summary",
  config: "config", settings: "config", تنظیمات: "config",
  fines: "fines", fine: "fine", جریمهها: "fines", جریمه_ها: "fines", جریمه: "fine", خلافی: "fines",
  paid: "paid", payfine: "paid", pay: "paid", پرداخت: "paid", پرداخت_جریمه: "paid",
  export: "export", csv: "export", خروجی: "export", دانلود: "export",
  wash: "wash", cleaning: "wash", carwash: "wash", شستشو: "wash", کارواش: "wash",
  repair: "repair", fixed: "repair", تعمیر: "repair", رفع: "repair",
  expense: "expense", cost: "expense", هزینه: "expense",
  note: "note", memo: "note", یادداشت: "note",
  latest: "latest", recent: "latest", آخرین: "latest",
  fuelstats: "fuelstats", fuel_stats: "fuelstats", consumption: "fuelstats", مصرف: "fuelstats",
  detail: "detail", event: "detail", info: "detail", جزئیات: "detail", رویداد: "detail",
  edit: "edit", اصلاح: "edit", ویرایش: "edit", revise: "revise", اصلاح_پیام: "revise",
  annotate: "annotate", comment: "annotate", noteevent: "annotate", توضیح: "annotate",
  actor: "actor", who: "actor", person: "actor", شخص: "actor", انجامدهنده: "actor",
  delete: "delete", remove: "delete", حذف: "delete",
  backup: "backup", exportjson: "backup", پشتیبان: "backup",
  cancel: "cancel", لغو: "cancel",
  restore: "restore", بازگردانی: "restore",
  people: "people", persons: "people", اشخاص: "people", افراد: "people",
  operations: "operations", records: "operations", list: "operations", allrecords: "operations", عملیات: "operations", سوابق: "operations", فهرست: "operations",
  undo: "undo", duplicates: "duplicates", duplicate: "duplicates", duplicatescan: "duplicates", تکراری: "duplicates", تکراریها: "duplicates", تکراری_ها: "duplicates"
};
const KNOWN_COMMANDS = new Set(Object.values(COMMAND_ALIASES));
function canonicalizeCommand(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^\/([^\s@]+)(?:@[^\s]+)?([\s\S]*)$/);
  if (!match) return { text: raw, unknown: false };
  const command = normalizeIntentText(match[1]).replace(/[\s-]+/g, "_");
  const aliasCompact = command.replace(/_/g, "");
  const canonical = COMMAND_ALIASES[command] || COMMAND_ALIASES[aliasCompact];
  if (!canonical || !KNOWN_COMMANDS.has(canonical)) return { text: raw, unknown: true, command: match[1] };
  return { text: `/${canonical}${match[2] || ""}`, unknown: false };
}
function normalizeIntentText(value) {
  return normalizeDigits(String(value || "").normalize("NFKC"))
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "").replace(/[\u200c\u200d]/g, " ")
    .replace(/[ـ]/g, "").replace(/[؛;]/g, ";").replace(/[،]/g, ",")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
function telegramHtml(value) {
  const lines = String(value || "").slice(0, 3800).split("\n");
  let firstContentSeen=false;
  const escape = value => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
  const trusted = value => {
    const tags=[];
    const tokenized=String(value||"").replace(/<\/?(?:code|blockquote|b|i|u|s)>/gi,tag=>{const token=`__SAFE_TAG_${tags.length}__`;tags.push(tag);return token;});
    let output=escape(tokenized);
    tags.forEach((tag,i)=>{output=output.replace(`__SAFE_TAG_${i}__`,tag);});
    return output;
  };
  const namedLinks = html => String(html).replaceAll(SITE_URL,`<a href="${SITE_URL}">باز کردن داشبورد</a>`).replaceAll(BOT_URL,`<a href="${BOT_URL}">گفت‌وگو با ربات</a>`);
  const headingPattern=/^(?:🧾|👤|📊|⛽|🚦|🧰|🗂|🛡️|🪪|📝|✏️|⚙️|🚘|📦|🔎|📖|💳|✅|❌|⚠️|🔩|🔧|🧪|🔋|🛠️|🧭)\s+[^:]{2,70}$/u;
  return lines.map(original=>{
    const line=original.trimEnd(); if(!line.trim())return "";
    let safe=namedLinks(trusted(line));
    if(!firstContentSeen){firstContentSeen=true;return `<b>${safe}</b>`;}
    if(headingPattern.test(line))return `<b>${safe}</b>`;
    const command=line.match(/^\s*(\/[a-zA-Z0-9_]+)(?:\s+(.*))?$/);
    if(command && !/<(?:code|b|a)\b/i.test(safe))return `<code>${escape(command[0].trim())}</code>`;
    const field=line.match(/^([^:：]{1,38})\s*[:：]\s*(.*)$/);
    if(field){
      const label=field[1].trim(), rawValue=field[2];
      if (rawValue.includes(SITE_URL)) return `<b>${escape(label)}:</b> <a href="${SITE_URL}">باز کردن داشبورد</a>`;
      if (rawValue.includes(BOT_URL)) return `<b>${escape(label)}:</b> <a href="${BOT_URL}">گفت‌وگو با ربات</a>`;
      if(/^(?:شناسه|ID|کد|شناسه تلگرام شما|شناسه گفتگو|شماره قبض|کد پیگیری پرداخت|شناسه گروه|شناسه مراجعه)$/i.test(label)) return `<b>${escape(label)}:</b> <code>${trusted(rawValue)}</code>`;
      if(/^(?:شرح عملیات|توضیح تکمیلی|یادداشت|شرح تعمیر|علت|توضیح)$/i.test(label)) return `<b>${escape(label)}:</b>\n<blockquote>${escape(rawValue)}</blockquote>`;
      if(/^(?:کیلومتر ثبت\s*شده|موعد کیلومتری بعدی|کیلومترشمار|مسافت|سوخت|هزینه|مبلغ|کارکرد فعلی|مسافت از آخرین کیلومتر ثبت\s*شده|مسافت از ثبت قبلی|ولتاژ|ظرفیت)$/i.test(label)) return `<b>${escape(label)}:</b> <code>${escape(rawValue)}</code>`;
      return `<b>${escape(label)}:</b> ${trusted(rawValue)}`;
    }
    if(/^(?:⚠️|⛔|💡|📌|نکته[:：])/u.test(line)||/^>\s*/.test(line)) return `<blockquote>${safe.replace(/^&gt;\s*/,"")}</blockquote>`;
    return safe.replace(/`([^`]{1,140})`/g,(_,code)=>`<code>${escape(code)}</code>`);
  }).join("\n");
}

async function processMessage(text, message, env, options = {}) {
  const parsedCommand = canonicalizeCommand(text);
  text = parsedCommand.text;
  if (parsedCommand.unknown) return { text: `دستور «/${parsedCommand.command}» شناخته نشد. راهنمای کامل و نمونه‌های ثبت را پایین ببین:\n\n${helpText()}`, keyboard: true };
  const lower = normalizeIntentText(text);
  const isPrivateDocumentCommand = /^\/(?:documents|vehicle-documents|مدارک|مدارک_خودرو|insurance|bime|بیمه)(?:@\w+)?(?:\s|$)/i.test(text);
  if (isPrivateDocumentCommand && message.chat?.type && message.chat.type !== "private") {
    return { text: "🔐 برای حفظ حریم خصوصی مدارک، دستورهای /documents و /insurance فقط در گفت‌وگوی خصوصی با ربات پاسخ داده می‌شوند. به @Peugeot206GarageBot پیام خصوصی بده.", keyboard: false };
  }
  const fromDate = new Date((message.date || Math.floor(Date.now() / 1000)) * 1000);
  const deepLinkEvent = text.match(/^\/start(?:@\w+)?\s+e_([a-f0-9-]{6,36})/i);
  if (deepLinkEvent) {
    const event = await findEventByPrefix(deepLinkEvent[1], env);
    return event ? { text: formatEventDetails(event), markup: eventActionKeyboard(event.id.slice(0, 8)) } : { text: "رویداد موردنظر پیدا نشد یا حذف شده است. /latest را بررسی کن.", keyboard: false };
  }
  if (/^\/(documents|vehicle-documents|مدارک|مدارک_خودرو)(?:@\w+)?\b/i.test(text)) return await privateDocumentsTelegramReply(env);
  if (/^\/(insurance|bime|بیمه)(?:@\w+)?\b/i.test(text)) return { text: await insuranceCommand(text.replace(/^\S+/, "").trim(), env), keyboard: false };
  if (/^\/(start|help)(?:@\w+)?\b/i.test(text)) return { text: helpText(), keyboard: true };
  if (/^\/guide\b|^\/راهنمای_کامل\b|^\/دفترچه\b/i.test(text)) return { messages: await guideMessages(env), keyboard: false };
  if (/^\/catalog\b|^\/parts\b|^\/قطعات\b|^\/کاتالوگ\b/i.test(text)) return { messages: await catalogGuideMessages(env), keyboard: false };
  if (/^\/components\b|^\/installed\b/i.test(text)) return { messages: await componentInventoryReport(env), keyboard: false };
  if (/^\/issues\b|^\/openissues\b|^\/خرابی(?:ها|_ها)?\b/i.test(text)) return await openIssuesReport(env);
  if (/^\/revise\b|^\/اصلاح_پیام\b/i.test(text)) return await reviseAnomalyMessage(text, message, env);
  if (/^\/services\b|^\/servicecatalog\b|^\/فهرست_سرویس\b/i.test(text)) return { messages: await serviceCatalogMessages(env), keyboard: false };
  if (/^\/repairjob\b|^\/workshop\b|^\/تعمیرگاه\b|^\/مراجعه\b/i.test(text)) {
    const result = await recordRepairJob(text.replace(/^\/\S+/, "").trim(), message, env, options);
    return typeof result === "string" ? { text: result, keyboard: false } : result;
  }
  if (/^\/issues\b|^\/openissues\b|^\/خرابی(?:ها|_ها)?\b/i.test(text)) return await openIssuesReport(env);
  if (/^\/revise\b|^\/اصلاح_پیام\b/i.test(text)) return await reviseAnomalyMessage(text, message, env);
  if (/^\/duplicates\b|^\/duplicate\b|^\/تکراری\b/i.test(text)) return { messages: await duplicateReviewMessages(env), keyboard: false };
  if (/^\/fineinfo\b|^\/جزئیات_جریمه\b/i.test(text)) return { text: await fineInfoCommand(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/purchasekm\b|^\/کیلومترخرید\b/i.test(text)) return { text: await purchaseOdometerCommand(text.replace(/^\S+/, "").trim(), env), keyboard: false };
  if (/^\/analysis\b|^\/charts\b|^\/نمودار\b|^\/تحلیل\b/i.test(text)) return await createAnalysisReply(text.replace(/^\S+/, "").trim(), env);
  if (/^\/cancel\b/i.test(text)) return { text: "✅ هیچ عملیات در انتظار تأییدی وجود ندارد. برای حذف از دکمه حذف در جزئیات رویداد استفاده کن.", keyboard: false };
  if (/^\/people\b|^\/اشخاص\b|^\/افراد\b/i.test(text)) return { text: await peopleCommand(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/operations\b|^\/records\b|^\/list\b|^\/سوابق\b|^\/عملیات\b|^\/فهرست\b/i.test(text)) return { messages: await operationsReport(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/id\b/i.test(text)) return { text: `شناسه تلگرام شما: ${message.from.id}\nشناسه گفتگو: ${message.chat.id}`, keyboard: false };
  if (/^\/(detail|event|info)\b/i.test(text)) {
    const id = text.replace(/^\/\S+/, "").trim();
    const event = await findEventByPrefix(id, env);
    return event ? { text: formatEventDetails(event), markup: eventActionKeyboard(event.id.slice(0, 8)) } : { text: "رویداد پیدا نشد. شناسه حداقل ۶ کاراکتر باشد؛ نمونه: /detail a1b2c3d4", keyboard: false };
  }
  if (/^\/edit\b/i.test(text)) return { text: await editEventCommand(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/annotate\b/i.test(text)) return { text: await annotateEventCommand(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/actor\b/i.test(text)) return { text: await actorEventCommand(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/delete\b/i.test(text)) {
    const id = text.replace(/^\/\S+/, "").trim();
    const event = await findEventByPrefix(id, env);
    return event ? { text: `⚠️ تأیید حذف این عملیات لازم است.\n\n${formatEventDetails(event)}\n\nرویداد پیش از حذف از دفتر فعال در بایگانی نگهداری می‌شود.`, markup: deleteConfirmationKeyboard(event.id.slice(0,8)) } : { text: "رویداد پیدا نشد. نمونه: /delete a1b2c3d4", keyboard: false };
  }
  if (/^\/restore\b/i.test(text)) return { text: await restoreDeletedEvent(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/summary\b/i.test(text) || /^\/گزارش\b/i.test(text)) return { text: await summaryReport(text, env), keyboard: true };
  if (/^\/due\b/i.test(text) || /^\/سرویس‌ها\b/i.test(text)) return { text: await dueReport(env), keyboard: true };
  if (/^\/config\b/i.test(text) || /^\/تنظیمات\b/i.test(text)) return { text: await configReport(env), keyboard: false };
  if (/^\/fines\b/i.test(text) || /^\/جریمه‌ها\b/i.test(text)) return { text: await finesReport(env), keyboard: false };
  if (/^\/export\b|^\/خروجی\b/i.test(text)) {
    const arg = text.replace(/^\/\S+/, "").trim();
    const month = extractMonthArgument(arg);
    const allMode = /^(?:all|همه|کل)(?:\s|$)/i.test(arg);
    const events = allMode || (!month && !arg) ? await loadAllEvents(env) : (await getMonth(month || nowTehran().date.slice(0, 7), env)).events || [];
    const fileLabel = allMode || (!month && !arg) ? "all" : (month || nowTehran().date.slice(0, 7));
    const csv = eventsToCsv(events);
    return { filename: `206-garage-${fileLabel}.csv`, document: new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), caption: `📦 خروجی CSV ${fileLabel === "all" ? "همه سوابق" : `ماه ${fileLabel}`} · ${events.length} رویداد` };
  }
  if (/^\/backup\b|^\/exportjson\b|^\/پشتیبان\b/i.test(text)) {
    const arg = text.replace(/^\/\S+/, "").trim();
    const month = extractMonthArgument(arg);
    const events = month ? (await getMonth(month, env)).events || [] : await loadAllEvents(env);
    const label = month || "all";
    const bundle = { schemaVersion: 1, exportedAt: nowTehran().iso, timezone: TZ, vehicle: (await readConfig(env)).vehicle || {}, count: events.length, events };
    return { filename: `206-garage-backup-${label}.json`, document: new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8" }), caption: `🛡️ نسخه پشتیبان JSON · ${label === "all" ? "همه سوابق" : label} · ${events.length} رویداد` };
  }
  if (/^\/km\b|^\/odo\b|^\/کارکرد\b/i.test(text)) {
    const rawBody = text.replace(/^\/\S+/, "").trim();
    const value = parseFirstNumber(rawBody);
    if (!(value > 0)) return { text: "کارکرد را این‌طور بفرست: /km 431503 یا /km ۴۳۱۵۰۳ بابام", keyboard: false };
    const remainder = rawBody.replace(/^\s*[\d][\d,._]*/, "").trim();
    const config = await readConfig(env);
    const metadata = extractEventMetadata(remainder, null, null, config.people || []);
    const rest = normalizeIntentText(remainder);
    const hasRepairDetails = /روشن.{0,12}(?:نشد|نمی.?شود|نمی.?شه)|استارت.{0,12}(?:نخورد|نمی.?خورد)|نشتی|دیاگ|هواگیری|تعویض|عوض\s*(?:شد|شده|کردم|شدند)|سنسور|باتری|باطری|شمع|وایر|ترموستات|روغن|تسمه|برطرف\s*شد|رفع\s*شد|تعمیر\s*شد/.test(rest) && (detectServiceKeys(remainder, config).length > 0 || /روشن|استارت|نشتی|دیاگ|هواگیری|تعویض|عوض\s*(?:شد|شده|کردم|شدند)|تعمیر\s*شد|برطرف\s*شد|رفع\s*شد/.test(rest));
    if (hasRepairDetails) {
      const actorPrefix = metadata.actor && metadata.actor !== "من" ? `${metadata.actor} ` : "";
      const repairText = `${actorPrefix}کیلومتر ${Math.round(value)} ${metadata.description || remainder}`.trim();
      const result = await recordRepairJob(repairText, message, env, options);
      return typeof result === "string" ? { text: result, keyboard: false } : result;
    }
    const description = metadata.description && metadata.description !== remainder ? metadata.description : (metadata.description || "");
    return { text: await saveEvent({ type: "odometer", title: description ? `ثبت کیلومترشمار · ${description.slice(0, 70)}` : "ثبت کیلومترشمار", description: description || "ثبت کیلومترشمار", actor: metadata.actor || "من", note: metadata.note || "", odometerKm: Math.round(value), occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
  }
  if (/^\/trip\b|^\/مسافت\b/i.test(text)) {
    const value = parseFirstNumber(text.replace(/^\/\S+/, ""));
    if (!(value > 0)) return { text: "مسافت طی‌شده را بفرست: /trip 85 یا /trip ۸۵", keyboard: false };
    return { text: await saveEvent({ type: "trip", title: "مسافت رانندگی", description: text, distanceKm: value, occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
  }
  if (/^\/fuel\b|^\/بنزین\b/i.test(text)) {
    const raw = text.replace(/^\/\S+/, "");
    const liters = parseLiters(raw);
    if (!(liters > 0)) return { text: "نمونه: /fuel 20l cost=700000 toman km=156200 full\nواحد مبلغ را تومان وارد کن، یا «ریال» بنویس.", keyboard: false };
    return { text: await saveEvent({ type: "fuel", title: "سوخت‌گیری", description: raw.trim() || text, liters, costRial: extractMoneyRial(raw), odometerKm: extractOdometer(raw), fullTank: /\bfull\b|باک\s*را\s*پر|باک\s*کامل|پر\s*کردم/i.test(raw), occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
  }
  if (/^\/service\b|^\/part\b|^\/سرویس\b|^\/قطعه\b/i.test(text)) {
    const raw = text.replace(/^\/\S+/, "").trim();
    return { text: await recordServiceOrPart(raw || text, text.startsWith("/part") ? "part" : "service", getOccurredAt(text, fromDate), env), keyboard: true };
  }
  if (/^\/interval\b|^\/بازه\b/i.test(text)) return { text: await updateInterval(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/wash\b|^\/شستشو\b|^\/کارواش\b/i.test(text)) {
    const raw = text.replace(/^\/\S+/, "").trim();
    return { text: await saveEvent({ type: "wash", title: "شست‌وشوی خودرو", description: raw || "شست‌وشوی خودرو", costRial: extractMoneyRial(raw), odometerKm: extractOdometer(raw), occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
  }
  if (/^\/fine\b|^\/جریمه\b/i.test(text)) {
    const raw = text.replace(/^\/\S+/, "").trim();
    const cost = extractMoneyRial(raw);
    if (!cost) return { text: "نمونه: /fine 500000 toman سرعت غیرمجاز km=156200\nمبلغ و دلیل را بنویس.", keyboard: false };
    return { text: await saveEvent({ type: "fine", title: "ثبت جریمه", description: raw, costRial: cost, odometerKm: extractOdometer(raw), paid: false, ticketDate: normalizeFlexibleDate(raw) || getOccurredAt(text, fromDate).date, deadlineDate: normalizeFlexibleDate(raw.match(/(?:مهلت|deadline)\s*[:=：]?\s*([0-9۰-۹٠-٩]{4}[\/.-][0-9۰-۹٠-٩]{1,2}[\/.-][0-9۰-۹٠-٩]{1,2})/i)?.[1]), appealed: /اعتراض|appeal/i.test(raw), ticketNumber: extractFineTicketNumber(raw), occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
  }
  if (/^\/paid\b|^\/payfine\b|^\/پرداخت(?:-جریمه)?\b/i.test(text)) return { text: await markFinePaid(text.replace(/^\/\S+/, "").trim(), env), keyboard: false };
  if (/^\/repair\b|^\/fixed\b|^\/تعمیر\b|^\/رفع\b/i.test(text)) return { text: await recordRepair(text.replace(/^\/\S+/, "").trim(), getOccurredAt(text, fromDate), env), keyboard: true };
  if (/^\/expense\b|^\/هزینه\b/i.test(text)) {
    const raw = text.replace(/^\/\S+/, "").trim();
    const cost = extractMoneyRial(raw);
    if (!cost) return { text: "نمونه: /expense 250000 toman پارکینگ یا /expense 1800000 ریال مکانیک", keyboard: false };
    return { text: await saveEvent({ type: "expense", title: "هزینه متفرقه", description: raw, costRial: cost, odometerKm: extractOdometer(raw), occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
  }
  if (/^\/note\b|^\/یادداشت\b/i.test(text)) {
    const raw = text.replace(/^\/\S+/, "").trim();
    return { text: await saveEvent({ type: "note", title: "یادداشت خودرو", description: raw, odometerKm: extractOdometer(raw), occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
  }
  if (/^\/latest\b|^\/آخرین\b/i.test(text)) return { text: await latestReport(env), keyboard: false };
  if (/^\/fuelstats\b|^\/مصرف\b/i.test(text)) return { text: await fuelReport(env), keyboard: false };
  if (/^\/undo\b/i.test(text)) return { text: "حذف امن با تأیید دو مرحله‌ای انجام می‌شود: /delete شناسه\nاگر اشتباهی حذف کردی: /restore شناسه\nبرای پیدا کردن شناسه از /latest یا /detail استفاده کن.", keyboard: false };

  // Natural-language entry: commands and plain Persian/English phrases are both accepted.
  const occurredAt = getOccurredAt(text, fromDate);
  const km = extractOdometer(text);
  const money = extractMoneyRial(text);
  const liters = parseLiters(text);
  if (isRepairJobNarrative(lower)) {
    const result = await recordRepairJob(text, message, env, options);
    return typeof result === "string" ? { text: result, keyboard: false } : result;
  }
  const isFuel = /بنزین|سوخت.?گیری|پمپ\s*بنزین|باک\s*(?:زدم|پر)|\bpetrol\b|\brefuel(?:led|ing)?\b|\bfuel\b|\bfilled\s*(?:up|the\s*tank)\b|\bgas(?:oline)?\b|\d+(?:\.\d+)?\s*l\b/i.test(lower) && liters > 0;
  if (isFuel) {
    return { text: await saveEvent({ type: "fuel", title: "سوخت‌گیری", description: text, liters, costRial: money, odometerKm: km, fullTank: /\bfull\b|باک\s*را\s*پر|باک\s*کامل|پر\s*کردم/i.test(text), occurredAt, sourceText: text }, env), keyboard: true };
  }
  if (/جریمه|خلافی|قبض\s*جریمه/i.test(lower) && !/پرداخت|واریز|تسویه|پرداخت کردم/i.test(lower)) {
    if (!money) return { text: "مبلغ جریمه مشخص نیست. نمونه: جریمه سرعت ۵۰۰ هزار تومان در کیلومتر ۱۵۶۲۰۰", keyboard: false };
    return { text: await saveEvent({ type: "fine", title: "ثبت جریمه", description: text, costRial: money, odometerKm: km, paid: false, occurredAt, sourceText: text }, env), keyboard: true };
  }
  if (/پرداخت.*جریمه|جریمه.*پرداخت|خلافی.*پرداخت|جریمه.*تسویه/i.test(lower)) return { text: await markFinePaid(text.replace(/.*?(?:شناسه|id)\s*/i, "").trim(), env), keyboard: false };
  if (/شستم|کارواش|شست.?وشو|واکس|نظافت/i.test(lower)) return { text: await saveEvent({ type: "wash", title: "شست‌وشوی خودرو", description: text, costRial: money, odometerKm: km, occurredAt, sourceText: text }, env), keyboard: true };
  if (SERVICE_START_WORDS.some(w => lower.includes(normalizeIntentText(w))) || /روغن موتور.*(عوض|تعویض)|فیلتر.*(عوض|تعویض)|تسمه تایم.*(عوض|تعویض)|\b(?:changed|replaced|renewed|serviced|service done|oil change|maintenance done)\b/i.test(lower)) {
    return { text: await recordServiceOrPart(text, "service", occurredAt, env), keyboard: true };
  }
  if (/خراب|خرابی|از کار افتاد|صدای|نشتی|لرزش|چکه|چراغ چک|عیب|مشکل|روشن.{0,10}(?:نمی.{0,5}(?:شود|شه|شه؟|زند)|نشد|نمی.?خورد)|استارت.{0,10}(?:نمی.{0,5}(?:خورد|زنه|زند)|نخورد)|باتری.{0,12}(?:خوابیده|خالی|ضعیف)|داغ کرد|جوش آورد|\bbroken\b|\bno.?start\b|\bwon.t start\b|\bdoesn.t start\b|\bnoise\b|\bleak(?:ing)?\b|\bvibration\b|\bcheck engine\b|\bissue\b|\bproblem\b|\boverheat(?:ed|ing)?\b/i.test(lower) && !/درست شد|تعمیر شد|رفع شد|\bfixed\b|\brepaired\b|\bresolved\b/i.test(lower)) {
    return { text: await saveEvent({ type: "issue", title: "ثبت خرابی/ایراد", description: text, odometerKm: km, costRial: money, status: "open", occurredAt, sourceText: text }, env), keyboard: true };
  }
  if (/درست شد|تعمیر شد|رفع شد|تعمیر کردم|مشکل حل شد|\bfixed\b|\brepaired\b|\bresolved\b|\bissue\s*fixed\b/i.test(lower)) return { text: await recordRepair(text, occurredAt, env), keyboard: true };
  if (/(کیلومتر|کارکرد|\bkm\b|\bodo\b)/i.test(lower) && km && !/مسافت|طی کردم|رانندگی|رفتم|کار کردم|راه رفتم/i.test(lower)) {
    return { text: await saveEvent({ type: "odometer", title: "ثبت کیلومترشمار", description: text, odometerKm: km, occurredAt, sourceText: text }, env), keyboard: true };
  }
  const distance = extractDistance(text);
  if (distance && /امروز|دیروز|رانندگی|رفتم|طی کردم|کار کردم|مسافت|کیلومتر راه|drive|drove|trip/i.test(lower)) {
    return { text: await saveEvent({ type: "trip", title: "مسافت رانندگی", description: text, distanceKm: distance, occurredAt, sourceText: text }, env), keyboard: true };
  }
  if (money && /هزینه|پرداخت|خریدم|خرید|مکانیک|یدک|قطعه|پارکینگ|عوارض|تعمیر/i.test(lower)) {
    return { text: await saveEvent({ type: "expense", title: "هزینه خودرو", description: text, costRial: money, odometerKm: km, occurredAt, sourceText: text }, env), keyboard: true };
  }
  if (km && /برگشتم|رسیدم|خانه|پارک کردم|ماشین شده|کارکرد ماشین|\barrived\b|\bback home\b|\bgot home\b|\bcurrent odometer\b|\bodo(?:meter)?\s*(?:is|:)?\b/i.test(lower)) {
    return { text: await saveEvent({ type: "odometer", title: "ثبت کیلومترشمار", description: text, odometerKm: km, occurredAt, sourceText: text }, env), keyboard: true };
  }
  if (/^(?:\/note\b|یادداشت(?:\s*[:：])?|note\s*[:：]|memo\s*[:：])/i.test(text.trim())) {
    const note = text.replace(/^(?:\/note|یادداشت|note|memo)\s*[:：]?/i, "").trim();
    return { text: await saveEvent({ type: "note", title: "یادداشت خودرو", description: note || text, odometerKm: km, costRial: money, occurredAt, sourceText: text }, env), keyboard: true };
  }
  return { text: `متن دریافت شد، اما نوع رویداد با اطمینان تشخیص داده نشد؛ برای جلوگیری از ثبت اشتباه، آن را ذخیره نکردم.\n\nمی‌توانی بنویسی «یادداشت: ...» یا یکی از نمونه‌های راهنما را استفاده کنی.\n\n${helpText()}`, keyboard: true };
}

function helpText() {
  return `🚘 دفتر هوشمند پژو ۲۰۶ SD · راهنمای شروع

🧭 ثبت سریع
• کیلومتر ۴۳۰۴۰۰ ← ثبت کیلومترشمار
• بابام کیلومتر ۴۳۰۴۰۰ ← اختلاف نسبت به ثبت قبل به نام بابام
• امروز ۸۵ کیلومتر رانندگی کردم
• بابام ۲۰ لیتر بنزین؛ هزینه ۷۰۰ هزار تومان؛ توضیح: سفر
• روغن موتور عوض شد؛ هزینه ۹۰۰ هزار تومان؛ کیلومتر ۴۳۰۰۰۰

👥 اشخاص و توضیحات
• اگر نام شخص را ننویسی، ثبت به نام «من» است.
• بابام: ۲۰ لیتر بنزین · توضیح: سفر خانوادگی
• /people add محمد — افزودن نام دلخواه
• /actor a1b2c3d4 بابام — تغییر انجام‌دهنده
• /annotate a1b2c3d4 توضیح تکمیلی — افزودن توضیح

📚 راهنمای کامل در چند پیام: /guide
🔩 فرهنگ قطعات: /catalog · قطعات نصب‌شده و عمرشان: /components
🧰 فهرست خدمات: /services
▣ مدارک خصوصی خودرو: /documents · وضعیت/ثبت بیمه: /insurance
🛠 ثبت یک مراجعه با چند قطعه/سرویس: /repairjob
🚦 جزئیات جریمه: /fineinfo شناسه
📈 گزارش تصویری با چهار نمودار: /analysis month (هزینه، سوخت، مسافت و سهم راننده)
گزینه‌های تحلیل: hour · day · week · month
⚠️ خرابی‌های باز و بستن با دکمه: /issues

🧭 کیلومتر خرید و پیمایش واقعی
/purchasekm — نمایش مبنا و اختلاف با کیلومتر فعلی
/purchasekm 428000 — تنظیم کیلومتر خرید
مبنا ۴۲۸٬۰۰۰ است؛ پیمایش فقط از تفریق دو قرائت واقعی محاسبه می‌شود و تاریخ خرید نامعلوم به روز فرضی تبدیل نمی‌شود.

🛠 مدیریت عملیات
/operations — آخرین ۲۰ عملیات با شناسه و دکمه‌ها
/operations all — فهرست کامل عملیات
/revise TOKEN متن اصلاح‌شده — اصلاح پیام هشدارخورده قبل از ثبت
/detail a1b2c3d4 — جزئیات
/edit a1b2c3d4 شخص=بابام | توضیح=سفر
/annotate a1b2c3d4 توضیح تکمیلی
/actor a1b2c3d4 نام شخص
/delete a1b2c3d4 — حذف با تأیید و بایگانی
/restore a1b2c3d4 — بازگردانی از بایگانی

📊 گزارش‌ها و نگهداری
/summary today|week|month|all — خلاصه و مبالغ
/fines — جمع کل جریمه، پرداختی و بدهی
/fuelstats — مصرف و هزینه سوخت
/due — سرویس‌های نزدیک موعد یا عقب‌افتاده
/config — تنظیمات و بازه‌های نگهداری
/interval engine_oil 5000 180 — تنظیم فاصله سرویس

📦 خروجی
/export all — CSV همه عملیات
/backup — پشتیبان JSON همه عملیات
/latest — آخرین موارد ثبت‌شده
/cancel — لغو روند مدیریت جاری

🌐 داشبورد · 🤖 ربات تلگرام
برای فهرست و مثال همه دستورها: /guide`;
}

async function guideMessages(env) {
  const config = await readConfig(env);
  const ownership = getOwnershipSettings(config);
  return [
    { text: `📘 راهنمای کامل · ۱ از ۴
🚘 ثبت کیلومتر و رانندگی


/km 430400 — کیلومترشمار فعلی
/trip 85 — ثبت ۸۵ کیلومتر مسافت
بابام کیلومتر 431381 — اختلاف از آخرین کیلومتر ثبت‌شده به نام بابام
امروز ۸۵ کیلومتر رانندگی کردم — ثبت مسافت با شخص پیش‌فرض من

پیش‌فرض مالکیت: کیلومتر خرید ${formatNum(ownership.purchaseOdometerKm)} km
برای بررسی اختلاف و تنظیم مبنا: /purchasekm

اگر تاریخ دقیق خرید مشخص نیست، سیستم مسافت تاریخی را در مجموع مالکیت نشان می‌دهد؛ آن را به ساعت/روز خاصی نسبت نمی‌دهد.` },
    { text: `⛽ راهنمای کامل · ۲ از ۴
سوخت، سرویس، هزینه و جریمه

/fuel 20l cost=700000 toman km=430400 full
بابام: ۲۰ لیتر بنزین؛ هزینه ۷۰۰ هزار تومان؛ توضیح: سفر
/service oil cost=900000 toman km=430000
/part air_filter cost=250000 toman km=430000
/interval engine_oil 5000 180
/fine 100000 toman سرعت غیرمجاز
/fines — مجموع کل، پرداخت‌شده و پرداخت‌نشده
/paid a1b2c3d4 — ثبت پرداخت جریمه
/wash 180000 toman توضیح=کارواش
/expense 250000 toman پارکینگ
خرابی: صدای جلوبندی
/repair a1b2c3d4 هزینه 1200000 تومان

مبلغ را با واحد تومان بنویس؛ اگر ریال است، صریحاً «ریال» بنویس.` },
    { text: `🧾 راهنمای کامل · ۳ از ۴
مشاهده و مدیریت عملیات

/operations — ۲۰ عملیات اخیر
/operations all — همهٔ عملیات (در چند پیام)
/operations today — موارد امروز
/operations week — ۷ روز اخیر
/detail a1b2c3d4 — جزئیات کامل
/edit a1b2c3d4 شخص=بابام | توضیح=سفر
/annotate a1b2c3d4 بررسی بعد از سفر
/actor a1b2c3d4 مادرم
/delete a1b2c3d4 — درخواست حذف؛ باید تأیید شود
/restore a1b2c3d4 — بازیابی از بایگانی
/people — فهرست اشخاص
/people add محمد — افزودن شخص
/people remove محمد — حذف از فهرست (سوابق پاک نمی‌شوند)

شناسهٔ کوتاه برای مدیریت و شناسهٔ کامل برای بازیابی در فایل خروجی نگهداری می‌شود.` },
    { text: `📊 راهنمای کامل · ۴ از ۴
گزارش، نمودار و خروجی

/summary today|week|month|all — خلاصهٔ بازه
/analysis hour — نمودار ۲۴ ساعت اخیر
/analysis day — نمودار ۳۰ روز اخیر
/analysis week — نمودار ۱۲ هفته اخیر
/analysis month — نمودار ۱۲ ماه اخیر (پیش‌فرض)
/fuelstats — آمار سوخت و مصرف
/due — موعد نگهداری
/latest — آخرین عملیات
/purchasekm 428000 — مبنای کیلومتر خرید
/export all — خروجی CSV همهٔ عملیات
/backup — فایل پشتیبان JSON
/config — بازه‌های نگهداری
/id — شناسه حساب مجاز ربات

📌 ارقام تحلیل فقط از داده‌های ثبت‌شده محاسبه می‌شوند. نمودارها با داده‌های تجمیع‌شدهٔ عددی ساخته می‌شوند؛ متن توضیحات و نام اشخاص برای ساخت نمودار به سرویس تصویر ارسال نمی‌شود.

🌐 داشبورد و 🤖 ربات تلگرام از لینک‌های قابل‌کلیک پیام باز می‌شوند.` }
  ];
}

function getOwnershipSettings(config = {}) {
  const source = config.ownership || {};
  const purchaseOdometerKm = Number(source.purchaseOdometerKm ?? config.vehicle?.purchaseOdometerKm ?? DEFAULT_PURCHASE_ODOMETER_KM);
  return {
    purchaseOdometerKm: Number.isFinite(purchaseOdometerKm) && purchaseOdometerKm > 0 ? Math.round(purchaseOdometerKm) : DEFAULT_PURCHASE_ODOMETER_KM,
    purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(source.purchaseDate || "")) ? String(source.purchaseDate) : null,
    defaultActor: String(source.defaultActor || "من")
  };
}

async function purchaseOdometerCommand(raw, env) {
  const config = await readConfig(env);
  const existing = getOwnershipSettings(config);
  if (!String(raw || "").trim()) {
    const events = await loadAllEvents(env);
    const current = calculateCurrentOdometer(events);
    const driven = current !== null && current >= existing.purchaseOdometerKm ? current - existing.purchaseOdometerKm : null;
    return `🚘 مبنای مالکیت پژو ۲۰۶\nکیلومتر هنگام خرید: ${formatNum(existing.purchaseOdometerKm)} km\nآخرین کیلومتر معتبر: ${current === null ? "ثبت نشده" : `${formatNum(current)} km`}\nپیمایش محاسبه‌شده از زمان خرید: ${driven === null ? "قابل محاسبه نیست؛ کیلومتر فعلی را بررسی کن" : `${formatNum(driven)} km`}\nتاریخ خرید: ${existing.purchaseDate || "ثبت نشده؛ سن تقویمی از خرید محاسبه نمی‌شود"}\n\nتنظیم کیلومتر خرید: /purchasekm 428000\nتنظیم همراه تاریخ خرید: /purchasekm 428000 date=2025-11-14\nعدد پیمایش از تفریق کیلومتر واقعی محاسبه می‌شود؛ هیچ برآورد حدسی دخیل نیست.`;
  }
  const km = parseFirstNumber(raw);
  if (!(km >= 10000 && km < 1000000)) return `نمونه: /purchasekm 428000\nکیلومتر خرید باید یک مقدار معتبر کیلومترشمار باشد.`;
  const dateMatch = normalizeDigits(raw).match(/(?:date|تاریخ)\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i);
  const saved = await mutateJsonFile(FILE_CONFIG, env, () => ({ schemaVersion: 1, serviceIntervals: {}, people: [] }), current => {
    current.ownership ||= {};
    current.ownership.purchaseOdometerKm = Math.round(km);
    delete current.ownership.estimatedKmSincePurchaseKm;
    delete current.ownership.estimatedDrivenSincePurchaseKm;
    current.ownership.purchaseDate = dateMatch ? dateMatch[1] : current.ownership.purchaseDate || null;
    current.ownership.defaultActor = "من";
    current.ownership.updatedAt = nowTehran().iso;
    return current;
  });
  const currentOdo = calculateCurrentOdometer(await loadAllEvents(env));
  const actual = currentOdo !== null && currentOdo >= saved.ownership.purchaseOdometerKm ? currentOdo - saved.ownership.purchaseOdometerKm : null;
  return `✅ مبنای مالکیت ذخیره شد\nکیلومتر خرید: ${formatNum(saved.ownership.purchaseOdometerKm)} km\nآخرین کیلومتر معتبر: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}\nپیمایش واقعی از خرید: ${actual === null ? "—" : `${formatNum(actual)} km`}\nتاریخ خرید: ${saved.ownership.purchaseDate || "ثبت نشده؛ سن تقویمی از خرید محاسبه نمی‌شود"}\n\nبرآورد فرضی در محاسبات استفاده نمی‌شود.`;
}

function buildAnalysisBuckets(period) {
  const now = Date.now(), offset = 210 * 60000, hour = 3600000, day = 86400000;
  const localNow = new Date(now + offset);
  let count, starts = [], unit;
  if (period === "hour") {
    count = 24; unit = hour;
    const base = Math.floor((now + offset) / hour) * hour - offset;
    for (let i = count - 1; i >= 0; i--) starts.push(base - i * unit);
  } else if (period === "day") {
    count = 30; unit = day;
    const base = Math.floor((now + offset) / day) * day - offset;
    for (let i = count - 1; i >= 0; i--) starts.push(base - i * unit);
  } else if (period === "week") {
    count = 12; unit = 7 * day;
    const midnight = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - offset;
    const base = midnight - ((localNow.getUTCDay() + 1) % 7) * day;
    for (let i = count - 1; i >= 0; i--) starts.push(base - i * unit);
  } else {
    period = "month"; count = 12;
    for (let i = count - 1; i >= 0; i--) starts.push(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - i, 1) - offset);
  }
  return starts.map((start, i) => {
    let end;
    if (period === "month") { const local = new Date(start + offset); end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - offset; }
    else end = start + unit;
    const labelDate = new Date(start + offset);
    let label;
    if (period === "hour") label = new Intl.DateTimeFormat("fa-IR", { timeZone: "UTC", hour: "2-digit", hourCycle: "h23" }).format(labelDate) + "";
    else if (period === "day") label = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "UTC", day: "numeric", month: "short" }).format(labelDate);
    else if (period === "week") label = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "UTC", day: "numeric", month: "short" }).format(labelDate);
    else label = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "UTC", month: "short", year: "2-digit" }).format(labelDate);
    return { start, end, label, key: `${start}-${i}` };
  });
}

function analysisPeriodLabel(period) {
  return ({ hour: "۲۴ ساعت اخیر", day: "۳۰ روز اخیر", week: "۱۲ هفته اخیر", month: "۱۲ ماه اخیر" })[period] || "۱۲ ماه اخیر";
}

async function createAnalysisReply(rawPeriod, env) {
  const raw = normalizeIntentText(rawPeriod || "month");
  const period = /hour|hourly|ساعتی|ساعت/.test(raw) ? "hour" : /day|daily|روزانه|روز/.test(raw) ? "day" : /week|weekly|هفتگی|هفته/.test(raw) ? "week" : "month";
  const [events, config] = await Promise.all([loadAllEvents(env), readConfig(env)]);
  const buckets = buildAnalysisBuckets(period);
  const inBucket = (event, timestamp) => { const t = Date.parse(timestamp || ""); return Number.isFinite(t) && buckets.some(b => t >= b.start && t < b.end); };
  const eventTimestamp = event => eventTimestampForReport(event);
  const expenseTimestamp = event => event.type === "fine" && event.paid && event.paidAt ? event.paidAt : event.type === "issue" && event.resolvedAt && Number(event.repairCostRial) > 0 ? event.resolvedAt : event.occurredAt || event.date;
  const rangedEvents = events.filter(event => inBucket(event, event.occurredAt || event.date));
  const expenseEvents = events.filter(event => Number(event.costRial) > 0 && (event.type !== "fine" || Boolean(event.paid)) && inBucket(event, expenseTimestamp(event)));
  const fuelEvents = rangedEvents.filter(event => event.type === "fuel");
  const distances = calculateDistanceEntries(events, config.ownership).filter(entry => !entry.estimatedHistorical && inBucket(entry, entry.occurredAt));
  const costValues = buckets.map(bucket => expenseEvents.filter(e => { const t=Date.parse(expenseTimestamp(e)||""); return t>=bucket.start&&t<bucket.end; }).reduce((sum,e)=>sum+(Number(e.costRial)||0),0)/10_000_000); // million toman
  const fuelValues = buckets.map(bucket => fuelEvents.filter(e => { const t=eventTimestamp(e); return t>=bucket.start&&t<bucket.end; }).reduce((sum,e)=>sum+(Number(e.liters)||0),0));
  const distanceValues = buckets.map(bucket => distances.filter(e => { const t=Date.parse(e.occurredAt||""); return t>=bucket.start&&t<bucket.end; }).reduce((sum,e)=>sum+(Number(e.distanceKm)||0),0));
  const driverTotals = new Map();
  distances.forEach(entry => { const actor = String(entry.actor || "من").trim() || "من"; driverTotals.set(actor, (driverTotals.get(actor) || 0) + (Number(entry.distanceKm) || 0)); });
  const driverRows = [...driverTotals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  const driverLabels = driverRows.length ? driverRows.map(row=>row[0]) : ["داده‌ای ثبت نشده"];
  const driverValues = driverRows.length ? driverRows.map(row=>Math.round(row[1]*10)/10) : [0];
  const fines = rangedEvents.filter(e => e.type === "fine");
  const fineTotal = fines.reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const finePaid = fines.filter(e=>e.paid).reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const fineUnpaid = fines.filter(e=>!e.paid).reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const actualCost = expenseEvents.reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const liters = fuelEvents.reduce((n,e)=>n+(Number(e.liters)||0),0);
  const currentOdo = calculateCurrentOdometer(events);
  const ownership = getOwnershipSettings(config);
  const ownershipKm = currentOdo !== null && currentOdo >= ownership.purchaseOdometerKm ? currentOdo - ownership.purchaseOdometerKm : null;
  const sumDistance = distanceValues.reduce((a,b)=>a+b,0);
  const report = `📊 گزارش تحلیلی پژو ۲۰۶ · ${analysisPeriodLabel(period)}

🧾 رویدادها: ${formatNum(rangedEvents.length)}
🚘 آخرین کیلومتر ثبت‌شده: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}
🚗 مسافت قابل انتساب در این بازه: ${formatNum(sumDistance)} km
⛽ سوخت ثبت‌شده: ${formatNum(liters,1)} لیتر
💳 هزینهٔ پرداخت‌شده در بازه: ${formatMoneyToman(actualCost)}

🚦 جریمه‌های این بازه
مجموع جریمه ثبت‌شده: ${formatMoneyToman(fineTotal)}
پرداخت‌شده: ${formatMoneyToman(finePaid)}
بدهی باز: ${formatMoneyToman(fineUnpaid)} (${formatNum(fines.filter(e=>!e.paid).length)} مورد)

🛒 پیمایش واقعی از زمان خرید
کیلومتر خرید: ${formatNum(ownership.purchaseOdometerKm)} km
تفریق کیلومتر فعلی منهای کیلومتر خرید: ${ownershipKm === null ? "قابل محاسبه نیست" : `${formatNum(ownershipKm)} km`}
تاریخ خرید: ${ownership.purchaseDate || "ثبت نشده؛ پیمایش به زمان ساختگی نسبت داده نمی‌شود"}

📈 چهار نمودار تصویری در پیام‌های بعدی ارسال می‌شوند: هزینه، سوخت، مسافت و سهم راننده.`;
  try {
    const labels = buckets.map(b=>b.label);
    const chartSpecs = [
      { filename: "206-garage-costs.png", title: `روند هزینه · ${analysisPeriodLabel(period)}`, seriesLabel: "میلیون تومان", values: costValues, type: "bar", color: "rgba(73,222,236,0.78)", caption: "💳 نمودار هزینه‌های پرداخت‌شده · مقیاس: میلیون تومان" },
      { filename: "206-garage-fuel.png", title: `سوخت‌گیری · ${analysisPeriodLabel(period)}`, seriesLabel: "لیتر", values: fuelValues, type: "line", color: "rgba(255,181,107,0.95)", caption: "⛽ نمودار حجم سوخت‌گیری · واحد: لیتر" },
      { filename: "206-garage-distance.png", title: `مسافت · ${analysisPeriodLabel(period)}`, seriesLabel: "کیلومتر", values: distanceValues, type: "line", color: "rgba(173,148,255,0.95)", caption: "🚗 نمودار مسافت ثبت‌شده · کیلومترهای تاریخی با تاریخ خرید نامشخص در بازه‌های زمانی توزیع نمی‌شوند." },
      { filename: "206-garage-drivers.png", title: `پیمایش به تفکیک راننده · ${analysisPeriodLabel(period)}`, seriesLabel: "کیلومتر", values: driverValues, labels: driverLabels, type: "bar", color: "rgba(66,232,188,0.85)", caption: "👤 نمودار پیمایش به تفکیک راننده · انتساب هر فاصله به شخص ثبت‌کننده قرائت دوم" }
    ];
    const photos = await Promise.all(chartSpecs.map(async spec => ({
      filename: spec.filename,
      blob: await createChartPng({ labels: spec.labels || labels, values: spec.values, title: spec.title, seriesLabel: spec.seriesLabel, color: spec.color, type: spec.type }),
      caption: `${spec.caption} · ${analysisPeriodLabel(period)}`
    })));
    return { text: report, photos, keyboard: false };
  } catch (error) {
    console.error("analysis chart generation failed", error?.stack || error);
    return { text: `${report}

⚠️ سرویس ساخت تصویر موقتاً در دسترس نبود؛ گزارش متنی بالا کامل است. دوباره /analysis ${period} را امتحان کن.`, keyboard: true };
  }
}

async function createChartPng({ labels, values, title, seriesLabel, color, type }) {
  const chart = {
    type,
    data: { labels, datasets: [{ label: seriesLabel, data: values, backgroundColor: type === "bar" ? color : "rgba(73,222,236,0.16)", borderColor: color, borderWidth: 3, tension: 0.32, fill: type === "line", pointRadius: 2.5 }] },
    options: { responsive: false, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: title, color: "#e7f4ff", font: { size: 20, weight: "bold" } }, tooltip: { enabled: true } }, scales: { x: { ticks: { color: "#9fb4c9", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(154,180,205,0.10)" } }, y: { beginAtZero: true, ticks: { color: "#9fb4c9" }, grid: { color: "rgba(154,180,205,0.12)" }, title: { display: true, text: seriesLabel, color: "#9fb4c9" } } } }
  };
  const response = await fetch(QUICKCHART_URL, { method: "POST", headers: { "content-type": "application/json", "accept": "image/png" }, body: JSON.stringify({ width: 1000, height: 600, format: "png", backgroundColor: "#08111f", chart }) });
  if (!response.ok) throw new Error(`QuickChart HTTP ${response.status}`);
  const typeHeader = response.headers.get("content-type") || "";
  if (typeHeader && !typeHeader.includes("image/png") && !typeHeader.includes("application/octet-stream")) throw new Error(`Unexpected chart content type: ${typeHeader}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 100) throw new Error("QuickChart returned an empty image");
  return new Blob([bytes], { type: "image/png" });
}

async function recordServiceOrPart(rawText, type, occurredAt, env) {
  const config = await readConfig(env);
  const keys = detectServiceKeys(rawText, config);
  const money = extractMoneyRial(rawText);
  const odo = extractOdometer(rawText);
  if (!keys.length && type === "service") {
    return "نوع سرویس یا قطعه از پیام تشخیص داده نشد. از /catalog و /services برای دیدن فرهنگ قطعات و سرویس‌ها استفاده کن.";
  }
  if (keys.length > 1) {
    const saved = [];
    for (let i=0;i<keys.length;i++) {
      const info = describeCatalogKey(keys[i], config);
      const reply = await saveCatalogEvent({ info, type, rawText, occurredAt, odometerKm: odo, costRial: i === 0 ? money : null }, env);
      saved.push(`${info.icon || "🔧"} ${info.label}: ${reply.split("\n").slice(0,2).join(" · ")}`);
    }
    return `✅ چند عملیات/قطعه به‌صورت جداگانه ثبت شد\n${saved.join("\n")}\nمبلغ پیام فقط یک بار به اولین مورد نسبت داده شد؛ اگر مبلغ‌ها متفاوت‌اند هر عملیات را جداگانه ثبت کن.`;
  }
  const info = keys.length ? describeCatalogKey(keys[0], config) : null;
  if (info) return saveCatalogEvent({ info, type, rawText, occurredAt, odometerKm: odo, costRial: money }, env);
  return await saveEvent({ type: type === "part" ? "part" : "service", title: `${type === "part" ? "ثبت قطعه" : "ثبت سرویس"}: ${rawText.slice(0,100)}`, description: rawText, odometerKm: odo, costRial: money, occurredAt, sourceText: rawText }, env);
}

function describeCatalogKey(key, config) {
  const catalog = config.partCatalog || {};
  if (String(key).startsWith("serviceCatalog:")) {
    const serviceKey = String(key).slice("serviceCatalog:".length);
    const item = catalog.services?.[serviceKey] || {};
    const category = catalog.categories?.[item.category] || {};
    return { key: serviceKey, serviceCatalogKey: serviceKey, label: item.label || serviceKey, categoryKey: item.category || "service", categoryLabel: category.label || item.category || "سرویس", icon: item.icon || category.icon || "🧰", mode: "service", note: item.note || "", service: true, item };
  }
  const item = catalog.items?.[key];
  if (item) {
    const category = catalog.categories?.[item.category] || {};
    return { key, componentKey: key, label: item.label || key, categoryKey: item.category || "other", categoryLabel: category.label || item.category || "قطعات", icon: item.icon || category.icon || "🔩", mode: item.mode || "condition", note: item.note || "", serviceKey: item.serviceKey || null, service: false, item };
  }
  const service = config.serviceIntervals?.[key];
  if (service) return { key, componentKey: key, label: service.label || key, categoryKey: service.category || "service", categoryLabel: service.category || "سرویس", icon: "🧰", mode: service.mode || "periodic", note: service.note || "", serviceKey: key, service: false, item: service };
  return { key, label: key, categoryKey: "other", categoryLabel: "سایر", icon: "🔧", mode: "condition", note: "", service: false, item: {} };
}

async function saveCatalogEvent({ info, type, rawText, occurredAt, odometerKm, costRial, actor = null, repairGroupId = null, brand = null, model = null, partNumber = null, specs = null, quantity = 1, status = null }, env) {
  const eventType = info.service ? "service" : "part";
  const input = {
    type: eventType,
    title: `${info.service ? "سرویس" : "ثبت/تعویض قطعه"}: ${info.label}`,
    description: `${info.label}${info.note ? ` · ${info.note}` : ""}`,
    sourceText: rawText,
    actor: actor || extractEventMetadata(rawText, null, null, []).actor || "من",
    odometerKm: odometerKm ?? extractOdometer(rawText),
    costRial: costRial ?? null,
    occurredAt,
    serviceKey: info.serviceKey || null,
    serviceCatalogKey: info.serviceCatalogKey || null,
    serviceLabel: info.label,
    componentKey: info.componentKey || null,
    componentName: info.service ? null : info.label,
    componentCategory: info.categoryLabel || null,
    componentMode: info.mode || null,
    componentReplaced: !info.service && /تعویض|عوض|جایگزین|نصب/i.test(normalizeIntentText(rawText)),
    brand, model, partNumber, specs, quantity, repairGroupId,
    status
  };
  return saveEvent(input, env);
}

async function catalogGuideMessages(env) {
  const config = await readConfig(env);
  const catalog = config.partCatalog || {};
  const categories = catalog.categories || {};
  const items = Object.entries(catalog.items || {});
  if (!items.length) return [{ text: "فرهنگ قطعات هنوز در data/config.json موجود نیست. فایل تنظیمات نسخهٔ ۳.۳ را ادغام کن." }];
  const messages = [{ text: `📚 فرهنگ قطعات پژو ۲۰۶ SD\n${items.length} قطعه در ${Object.keys(categories).length} گروه\n\nنکته: فاصله‌های کیلومتری/زمانی در این فهرست یادآور قابل‌تنظیم‌اند، نه جایگزین دفترچهٔ دقیق موتور و شرایط رانندگی.` }];
  for (const [categoryKey, category] of Object.entries(categories)) {
    const rows = items.filter(([, item]) => item.category === categoryKey);
    if (!rows.length) continue;
    const body = rows.map(([key,item]) => {
      const mode = item.mode === "periodic" ? `دوره‌ای · ${item.intervalKm ? `${formatNum(item.intervalKm)} km` : "بدون فاصلهٔ km"}${item.intervalDays ? ` / ${formatNum(item.intervalDays)} روز` : ""}` : "عمرمحور/شرطی · تاریخ و کیلومتر نصب را ثبت کن";
      return `${item.icon || category.icon || "🔩"} <b>${item.label}</b> <code>${key}</code>\n${mode}\n${item.note || "بازهٔ ثابت تنظیم نشده است."}`;
    });
    for (let i=0;i<body.length;i+=7) messages.push({ text: `${category.icon || "🧩"} ${category.label || categoryKey} · ${i+1}-${Math.min(i+7,body.length)} از ${body.length}\n\n${body.slice(i,i+7).join("\n\n")}` });
  }
  messages.push({ text: "ثبت قطعه: /part شمع موتور تعویض شد کیلومتر=431462\nثبت مشخصات: /part باتری 12 ولت 60 آمپر برند=... مدل=... شماره‌قطعه=... قیمت=... تومان\nفهرست نصب‌ها: /components\nراهنمای سرویس‌ها: /services" });
  return messages;
}

async function serviceCatalogMessages(env) {
  const config = await readConfig(env);
  const rows = Object.entries(config.partCatalog?.services || {});
  if (!rows.length) return [{ text: "فهرست سرویس‌ها هنوز در config.json وجود ندارد." }];
  const messages = [];
  for (let start=0;start<rows.length;start+=8) {
    const chunk = rows.slice(start,start+8).map(([key,item]) => {
      const cat = config.partCatalog?.categories?.[item.category] || {};
      return `${item.icon || cat.icon || "🧰"} <b>${item.label}</b> <code>${key}</code>\n${item.note || "توضیح ثبت نشده"}\nنمونه: <code>/service ${String(item.aliases?.[0] || item.label).replace(/[<>]/g,"")}</code>`;
    });
    messages.push({ text: `🧰 کاتالوگ خدمات خودرو · ${start+1}-${Math.min(start+8,rows.length)} از ${rows.length}\n\n${chunk.join("\n\n")}` });
  }
  return messages;
}

async function componentInventoryReport(env) {
  const [events, config] = await Promise.all([loadAllEvents(env), readConfig(env)]);
  const installed = events.filter(event => event.type === "part" && event.componentKey && event.componentReplaced)
    .sort((a,b)=>String(b.occurredAt||"").localeCompare(String(a.occurredAt||"")));
  if (!installed.length) return [{ text: "🔩 هنوز قطعه‌ای با تاریخ نصب/تعویض ثبت نشده است.\nنمونه: /part باتری تعویض شد 12 ولت 60 آمپر برند=نامشخص کیلومتر=431462\nبرای فرهنگ قطعات: /catalog" }];
  const latest = new Map();
  for (const event of installed) if (!latest.has(event.componentKey)) latest.set(event.componentKey,event);
  const odo = calculateCurrentOdometer(events);
  const results=[];
  const lines=[...latest.values()].map(event=>{
    const item=config.partCatalog?.items?.[event.componentKey] || {};
    const elapsedDays=daysBetween(String(event.date||event.occurredAt||"").slice(0,10),nowTehran().date);
    const elapsedKm=odo!=null && event.odometerKm!=null && odo>=Number(event.odometerKm) ? odo-Number(event.odometerKm) : null;
    return `${item.icon || "🔩"} <b>${event.componentName || item.label || event.componentKey}</b>\nگروه: ${event.componentCategory || item.category || "—"} · آخرین نصب: ${event.jalaliDate || event.date}\nکارکرد هنگام نصب: ${event.odometerKm==null?"ثبت نشده":`${formatNum(event.odometerKm)} km`} · عمر فعلی: ${elapsedKm==null?"—":`${formatNum(elapsedKm)} km`} / ${elapsedDays==null?"—":`${formatNum(elapsedDays)} روز`}\nبرند: ${event.brand || "ثبت نشده"} · مدل: ${event.model || "ثبت نشده"}\nشناسه: <code>${event.id.slice(0,8)}</code>`;
  });
  for (let start=0;start<lines.length;start+=8) results.push({ text: `🔩 قطعات نصب‌شده و عمر کارکرد\n${start+1}-${Math.min(start+8,lines.length)} از ${lines.length}\n\n${lines.slice(start,start+8).join("\n\n")}` });
  return results;
}

function isRepairJobNarrative(lower) {
  const text = normalizeIntentText(lower);
  const hasWorkshop = /تعمیر\s*گاه|مکانیک|برق.?کار|دیاگ|تعمیرکار|تعمیرگاه برد|بردیم تعمیر/.test(text);
  const hasSymptom = /روشن.{0,12}(?:نشد|نمی.?شد|نمی.?شود|نمی.?شه)|استارت.{0,12}(?:نخورد|نمی.?خورد)|خراب|نشتی|چکه|روغن.{0,10}(?:نشت|کم می.?کند)/.test(text);
  const markers = [
    /دیاگ|اسکن خطا|عیب.?یابی/, /شمع/, /وایر/, /باتری|باطری/, /ترموستات|محفظه/, /هواگیری/, /دور فن|درجه آب/,
    /سنسور دور موتور|سنسور میل.?لنگ/, /روغن هیدرولیک|نشتی هیدرولیک/, /واسکازین|روغن گیربکس|نشتی گیربکس/,
    /تسمه تایم|تسمه دینام/, /روغن ترمز|روغن موتور|روغن گیربکس/, /اجرت|دستمزد/, /کارواش|شستم/ 
  ].filter(pattern=>pattern.test(text)).length;
  const actionCount = (text.match(/تعویض|عوض شد|تعمیر شد|برطرف شد|رفع شد|تنظیم شد|هواگیری|دیاگ|نشتی|شکست|روشن نشد/g) || []).length;
  const multiAction = markers >= 2 && (actionCount >= 2 || hasSymptom);
  const resolvedNoStartWithParts = hasSymptom && /(?:سنسور|باتری|باطری|استارت|کوئل|پمپ بنزین|وایر|شمع)/.test(text) && /تعویض|عوض|تعمیر|برطرف|رفع|تنظیم/.test(text);
  return (hasWorkshop && (markers >= 2 || hasSymptom && markers >= 1 || actionCount >= 3 && markers >= 2)) || multiAction || resolvedNoStartWithParts;
}

function findCatalogCost(raw, targetPattern, stopPattern = null, useLastMatch = true) {
  const flags = targetPattern.flags.includes("g") ? targetPattern.flags : `${targetPattern.flags}g`;
  const pattern = new RegExp(targetPattern.source, flags);
  const matches = [...String(raw).matchAll(pattern)];
  if (!matches.length) return null;
  const match = useLastMatch ? matches[matches.length-1] : matches[0];
  const start = match.index || 0;
  let end = Math.min(String(raw).length, start+220);
  if (stopPattern) {
    const tail = String(raw).slice(start+match[0].length);
    const stop = stopPattern.exec(tail);
    if (stop) end = Math.min(end, start+match[0].length+(stop.index||0));
  }
  const segment = String(raw).slice(start,end);
  return extractMoneyRial(segment);
}

function makeRepairJobInputs(rawText, config, message) {
  const lower = normalizeIntentText(rawText);
  const occurredAt = getOccurredAt(rawText, new Date((message?.date || Math.floor(Date.now()/1000))*1000));
  const actor = extractEventMetadata(rawText, null, null, config.people || []).actor || "من";
  const odometerKm = extractOdometer(rawText);
  const repairGroupId = crypto.randomUUID();
  const items = config.partCatalog?.items || {};
  const services = config.partCatalog?.services || {};
  const categories = config.partCatalog?.categories || {};
  const created = [];
  const addedParts = new Set();
  const addedServices = new Set();
  const addedIssues = new Set();
  const replacementPattern = /تعویض|عوض\s*(?:شد|شده|شدند|کردم|کرده|کردن|شدن)?|جایگزین|نصب\s*(?:شد|کردم|شده)?|replac(?:e|ed|ement)|changed|renewed/i;
  const resolutionPattern = /(?:برطرف|رفع|درست|تعمیر|حل)\s*(?:شد|شده|کردم|کرده)|مشکل\s+(?:حل|برطرف)\s+شد|روشن\s+شد|به\s+کار\s+افتاد/i;
  const money = (pat, stop, last=true) => findCatalogCost(rawText, pat, stop, last);
  const addService = (key, description, costRial = null) => {
    if (addedServices.has(key)) return;
    const service = services[key];
    if (!service) return;
    addedServices.add(key);
    created.push({ type: "service", title: `سرویس: ${service.label}`, description, occurredAt, actor, odometerKm, costRial, sourceText: rawText, serviceCatalogKey: key, serviceLabel: service.label, componentCategory: categories[service.category]?.label || service.category, componentName: service.label, componentMode: "service", repairGroupId });
  };
  const addPart = (key, costRial = null, specs = null, brand = null, model = null, partNumber = null) => {
    if (addedParts.has(key)) return;
    const item = items[key];
    if (!item) return;
    addedParts.add(key);
    created.push({ type: "part", title: `تعویض قطعه: ${item.label}`, description: item.label, occurredAt, actor, odometerKm, costRial: costRial ?? null, sourceText: rawText, serviceKey: item.serviceKey || (config.serviceIntervals?.[key] ? key : null), serviceLabel: item.label, componentKey: key, componentName: item.label, componentCategory: categories[item.category]?.label || item.category, componentMode: item.mode || "condition", componentReplaced: true, brand, model, partNumber, specs, repairGroupId, quantity: 1 });
  };
  const addIssue = (key, title, description, status, symptom, repairDescription = null) => {
    if (addedIssues.has(key)) return;
    addedIssues.add(key);
    created.push({ type: "issue", title, description, occurredAt, actor, odometerKm, costRial: null, sourceText: rawText, status, symptom, repairDescription: repairDescription || null, resolvedAt: status === "fixed" ? occurredAt.iso : null, repairGroupId });
  };

  // A mileage explicitly included in a workshop message must update the odometer timeline,
  // not merely be copied into each repair line.
  if (odometerKm != null) created.push({ type: "odometer", title: "کیلومترشمار هنگام مراجعه", description: "قرائت کیلومترشمار هنگام مراجعه/تعمیر", occurredAt, actor, odometerKm, sourceText: rawText, repairGroupId });

  // The no-start issue is fixed only when the text describes a plausible resolution,
  // such as replacing the crank sensor/starting component or explicitly saying the car works again.
  const noStart = /روشن.{0,14}(?:نشد|نمی.?شد|نمی.?شود|نمی.?شه)|استارت.{0,14}(?:نخورد|نمی.?خورد|نمی.?زند)|روشن\s*نمی.?شد/i.test(lower);
  const noStartFixed = /(?:سنسور دور موتور|سنسور میل.?لنگ|باتری|باطری|استارت|کوئل|پمپ بنزین).{0,90}(?:تعویض|عوض|تعمیر|برطرف|رفع)|(?:تعویض|عوض|تعمیر).{0,90}(?:سنسور دور موتور|سنسور میل.?لنگ|باتری|باطری|استارت|کوئل|پمپ بنزین)|مشکل روشن شدن برطرف شد|ماشین روشن شد/i.test(lower);
  if (noStart) addIssue("no-start", "خرابی: خودرو روشن نشد", "خودرو روشن نشد/استارت نخورد؛ شرح کامل عیب‌یابی در مراجعه تعمیرگاه نگهداری شده است.", noStartFixed ? "fixed" : "open", "روشن نشدن خودرو", noStartFixed ? "طبق شرح پیام، قطعه/سیستم مرتبط عیب‌یابی یا تعمیر شده است؛ برای جزئیات به ردیف‌های همین مراجعه مراجعه کن." : null);

  const hydraulicLeak = /(?:نشتی|نشت|چکه).{0,25}(?:روغن\s*)?(?:هیدرولیک|فرمان)|(?:روغن\s*)?(?:هیدرولیک|فرمان).{0,25}(?:نشتی|نشت|چکه)/i.test(lower);
  const leakResolved = /(?:نشتی|نشت|چکه)[^,;|]{0,60}(?:برطرف\s*شد|رفع\s*شد|تعمیر\s*شد|درست\s*شد)|(?:برطرف\s*شد|رفع\s*شد|تعمیر\s*شد)[^,;|]{0,60}(?:نشتی|نشت|چکه)/i.test(lower);
  if (hydraulicLeak) addIssue("power-steering-leak", "نشتی روغن هیدرولیک فرمان", "نشتی روغن هیدرولیک فرمان گزارش شد.", leakResolved ? "fixed" : "open", "نشتی روغن هیدرولیک", leakResolved ? "طبق پیام، نشتی روغن هیدرولیک برطرف شده است." : null);

  const gearboxLeak = /(?:نشتی|نشت|چکه).{0,30}(?:واسکازین|روغن\s*گیربکس|گیربکس)|(?:واسکازین|روغن\s*گیربکس|گیربکس).{0,30}(?:نشتی|نشت|چکه)/i.test(lower);
  const gearboxLeakUnresolved = /(?:هنوز\s*(?:برطرف|رفع|تعمیر|درست)\s*نشده|برطرف\s*نشده|رفع\s*نشده|همچنان\s*(?:نشتی|نشت)|نشتی\s*دارد|نشت\s*می.?کند|نشتی\s*می.?کند)/i.test(lower);
  if (gearboxLeak) {
    const resolved = resolutionPattern.test(lower) && !gearboxLeakUnresolved;
    addIssue("gearbox-oil-leak", "نشتی روغن گیربکس / واسکازین", "نشتی روغن گیربکس/واسکازین گزارش شد.", resolved ? "fixed" : "open", "نشتی روغن گیربکس / واسکازین", resolved ? "طبق پیام، نشتی برطرف شده است." : null);
  }

  // Repair-shop services explicitly recognized in Persian free text.
  if (/دیاگ|اسکن خطا|عیب.?یابی/.test(lower)) addService("engine_diagnostics", "دیاگ و عیب‌یابی موتور؛ کد خطا در صورت وجود در شرح اصلی حفظ شود.");
  if (/درجه آب|دور فن|تنظیم.*فن|فن.*تنظیم/.test(lower)) addService("cooling_fan_adjustment", "بررسی/تنظیم درجه آب و دور فن طبق گزارش تعمیرگاه.");
  if (/هواگیری/.test(lower)) addService("cooling_bleed", "هواگیری مدار خنک‌کاری.");
  if (/سنسور دور موتور|سنسور میل.?لنگ/.test(lower) && /دیاگ|عیب.?یابی|مشکل.*از|علت.*از|تست/.test(lower)) addService("crankshaft_sensor_diagnosis", "عیب‌یابی سنسور دور موتور/موقعیت میل‌لنگ طبق شرح پیام.");
  if (hydraulicLeak && leakResolved) addService("power_steering_leak_repair", "رفع نشتی روغن هیدرولیک فرمان طبق گزارش.");
  if (gearboxLeak) addService("gearbox_leak_inspection", "بررسی/تشخیص نشتی روغن گیربکس؛ وضعیت خرابی جداگانه ثبت شده است.");

  // Keep richer, historically supported parsing for battery and thermostat specifications/costs.
  const hasReplacement = pattern => {
    const aliases = Array.isArray(pattern) ? pattern : [String(pattern)];
    return aliases.some(alias => repairAliasHasAction(lower, alias, replacementPattern));
  };
  if (/شمع/.test(lower) && hasReplacement(["شمع موتور", "شمع ها", "شمع‌ها", "شمع"])) {
    addPart("spark_plugs", money(/شمع(?:‌ها| ها| موتور)?/i, /وایر|باتری|باطری|ترموستات|محفظه|هواگیری/i, false));
  }
  if (/وایر/.test(lower) && hasReplacement(["وایر شمع", "وایر"])) {
    addPart("spark_plug_wires", money(/وایر(?:\s*شمع)?/i, /باتری|باطری|ترموستات|محفظه|هواگیری/i, true));
  }
  if (/باتری|باطری/.test(lower) && hasReplacement(["باتری", "باطری"])) {
    const voltage = rawText.match(/(\d+(?:[.,]\d+)?)\s*ولت/i);
    const capacity = rawText.match(/(\d+(?:[.,]\d+)?)\s*(?:[اآ]?مپر\s*ساعت|[اآ]?مپر\s*ساعتی|[اآ]?مپر|ah)/i);
    const specs = {};
    if (voltage) specs.voltageV = Number(voltage[1].replace(",", "."));
    if (capacity) specs.capacityAh = Number(capacity[1].replace(",", "."));
    const unknownBrand = /برند\s*(?:باتری|باطری)?\s*(?:را|رو)?\s*(?:نمی.?دانم|نمی.?دونم|نمیدانم|نمیدونم|نامشخص|معلوم نیست|unknown)/i.test(rawText);
    const brand = unknownBrand ? "نامشخص" : rawText.match(/برند\s*(?:باتری|باطری)?\s*[:=：]?\s*([^,;؛|]+?)(?=\s+(?:مدل|شماره|قیمت|هزینه|با قیمت|مشخصات)|[,;؛|]|$)/i)?.[1]?.trim() || null;
    addPart("battery", money(/(?:باتری|باطری)/i, /ترموستات|محفظه|هواگیری/i, true), Object.keys(specs).length ? specs : null, brand);
  }
  if (/ترموستات/.test(lower) && hasReplacement(["ترموستات", "محفظه ترموستات"])) {
    addPart("thermostat", money(/ترموستات(?!\s*(?:و\s*)?محفظه)/i, /محفظه\s*ترموستات/i, false));
    if (/محفظه\s*ترموستات/.test(lower)) addPart("thermostat_housing", money(/محفظه\s*ترموستات/i, /هواگیری|با اجرت|اجرت|دستمزد/i, true));
  }

  // Generic dictionary-driven component parser. New parts added to config become usable
  // without another hard-coded if-block; only mentions with a nearby replacement action count.
  const componentMatches = collectCatalogMentions(lower, items, "part");
  const namedCosts = extractNamedCatalogCosts(rawText, items);
  for (let i = 0; i < componentMatches.length; i++) {
    const match = componentMatches[i];
    const context = repairMentionContext(lower, match, componentMatches);
    // A leak is a condition/issue, not a physical part that was replaced.
    if (match.key.endsWith("_leak") || match.item?.kind === "issue" || match.item?.mode === "issue") continue;
    if (!replacementPattern.test(context)) continue;
    if (addedParts.has(match.key)) continue;
    const item = items[match.key];
    const costRial = namedCosts.get(match.key) ?? repairCostForMention(rawText, match, componentMatches, items);
    let specs = null;
    let brand = null;
    const voltage = context.match(/(\d+(?:[.,]\d+)?)\s*ولت/i);
    const capacity = context.match(/(\d+(?:[.,]\d+)?)\s*(?:آ?مپر\s*ساعت|آ?مپر|ah)/i);
    if (voltage || capacity) {
      specs = {};
      if (voltage) specs.voltageV = Number(voltage[1].replace(",", "."));
      if (capacity) specs.capacityAh = Number(capacity[1].replace(",", "."));
    }
    if (/برند\s*[:=：]?\s*(?:نامشخص|نمی.?دانم|نمیدانم|unknown)/i.test(context)) brand = "نامشخص";
    addPart(match.key, costRial, specs, brand);
  }

  // Dynamic service dictionary: record maintenance actions that were added to the catalog later.
  const serviceMatches = collectCatalogMentions(lower, services, "service");
  for (const match of serviceMatches) {
    const context = repairMentionContext(lower, match, serviceMatches);
    if (!/(دیاگ|تنظیم|هواگیری|سرویس|بازدید|بررسی|تعمیر|شارژ|بالانس|میزان فرمان|رفع|برطرف|تعویض|عوض\s*شد)/i.test(context)) continue;
    if (addedServices.has(match.key)) continue;
    const service = services[match.key];
    addService(match.key, `${service.label} طبق گزارش پیام: ${rawText.slice(0, 300)}`, null);
  }

  if (/اجرت|دستمزد/.test(lower)) {
    const labor = money(/(?:اجرت|دستمزد)/i, null, true);
    if (labor != null) created.push({ type: "expense", title: "اجرت تعمیرگاه", description: "اجرت/دستمزد ثبت‌شده برای مراجعه تعمیرگاه", expenseCategory: "labor", occurredAt, actor, odometerKm, costRial: labor, sourceText: rawText, repairGroupId });
  }
  if (/شستم|شست(?:م|یم|ه)?|کارواش|شست.?وشو/.test(lower)) {
    if (!created.some(event => event.type === "wash")) created.push({ type: "wash", title: "شست‌وشوی خودرو", description: "شست‌وشوی خودرو طبق پیام", occurredAt, actor, odometerKm, costRial: extractMoneyRial(rawText), sourceText: rawText, repairGroupId });
  }
  return created;
}

function repairAliasHasAction(lower, alias, actionPattern) {
  const needle = normalizeIntentText(alias);
  if (!needle) return false;
  let index = lower.indexOf(needle);
  while (index >= 0) {
    const separators = [",", ";", "|", "\n"];
    let prevBoundary = -1;
    let nextBoundary = lower.length;
    for (const sep of separators) {
      prevBoundary = Math.max(prevBoundary, lower.lastIndexOf(sep, index));
      const found = lower.indexOf(sep, index + needle.length);
      if (found >= 0) nextBoundary = Math.min(nextBoundary, found);
    }
    const context = lower.slice(Math.max(prevBoundary + 1, index - 20), Math.min(nextBoundary, index + needle.length + 70));
    if (actionPattern.test(context)) return true;
    index = lower.indexOf(needle, index + needle.length);
  }
  return false;
}

function collectCatalogMentions(lower, entries, kind) {
  const candidates = [];
  for (const [key, item] of Object.entries(entries || {})) {
    const aliases = [...new Set([key.replace(/_/g, " "), item.label, ...(item.aliases || [])].map(normalizeIntentText).filter(alias => alias.length >= 3))];
    for (const alias of aliases) {
      let from = 0;
      while ((from = lower.indexOf(alias, from)) >= 0) {
        candidates.push({ key, kind, alias, start: from, end: from + alias.length, length: alias.length, item });
        from += Math.max(1, alias.length);
      }
    }
  }
  candidates.sort((a, b) => a.start - b.start || b.length - a.length || a.key.localeCompare(b.key));
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.some(existing => candidate.start < existing.end && candidate.end > existing.start)) continue;
    accepted.push(candidate);
  }
  return accepted;
}

function repairMentionContext(lower, match, matches) {
  const separators = [",", ";", "|", "\n"];
  let start = 0, end = lower.length;
  for (const sep of separators) {
    start = Math.max(start, lower.lastIndexOf(sep, match.start) + 1);
    const found = lower.indexOf(sep, match.end);
    if (found >= 0) end = Math.min(end, found);
  }
  const previousSame = matches.filter(item => item.key === match.key && item.end <= match.start).at(-1);
  const nextSame = matches.find(item => item.key === match.key && item.start >= match.end);
  if (previousSame) start = Math.max(start, previousSame.end);
  if (nextSame) end = Math.min(end, nextSame.start);
  return lower.slice(Math.max(start, match.start - 28), Math.min(end, match.end + 70));
}

function extractNamedCatalogCosts(rawText, items) {
  const result = new Map();
  const moneyPattern = /(\d[\d,._]*)\s*(هزار|میلیون|ملیون|میليون|k|m)?\s*(تومان|تومن|ریال|rial|toman|tomans)/ig;
  const raw = String(rawText || "");
  const matches = [...raw.matchAll(moneyPattern)];
  for (const moneyMatch of matches) {
    const amount = extractMoneyRial(moneyMatch[0]);
    if (amount == null) continue;
    const before = raw.slice(Math.max(0, (moneyMatch.index || 0) - 150), moneyMatch.index || 0);
    const labels = ["قیمت", "هزینه", "مبلغ", "اجرت", "دستمزد", "به مبلغ", "با قیمت"];
    const normalizedBefore = normalizeIntentText(before);
    let latest = null;
    for (const label of labels) {
      const normalizedLabel = normalizeIntentText(label);
      const at = normalizedBefore.lastIndexOf(normalizedLabel);
      if (at >= 0 && (!latest || at > latest.at)) latest = { label, at, normalizedLabel };
    }
    // Labor is a separate cost line; never attach it to a part mentioned in the description.
    if (latest && /^(?:اجرت|دستمزد)$/.test(normalizeIntentText(latest.label))) continue;
    let descriptor = latest ? normalizedBefore.slice(latest.at + latest.normalizedLabel.length) : normalizedBefore.slice(-85);
    descriptor = descriptor.split(";").at(-1).split("|").at(-1).split(",").at(-1);
    const candidates = collectCatalogMentions(descriptor, items, "part");
    if (!candidates.length) continue;
    const last = candidates[candidates.length - 1];
    result.set(last.key, amount);
  }
  return result;
}

function repairCostForMention(rawText, match, matches, items) {
  // Find a raw-text start close to the normalized alias index (normalization may remove ZWNJ).
  let rawStart = 0;
  let low = 0, high = rawText.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (normalizeIntentText(rawText.slice(0, mid)).length < match.start) low = mid + 1;
    else high = mid;
  }
  rawStart = Math.max(0, low);
  const nextMatch = matches.filter(item => item.start >= match.end && item.start > match.start).sort((a,b)=>a.start-b.start)[0];
  let rawEnd = Math.min(rawText.length, rawStart + 200);
  // Do not inherit a price from a later, separately described repair operation.
  for (const sep of [";", "؛", "|", "\n"]) {
    const found = rawText.indexOf(sep, rawStart);
    if (found >= 0) rawEnd = Math.min(rawEnd, found);
  }
  if (nextMatch) {
    let lowEnd = rawStart, highEnd = rawText.length;
    while (lowEnd < highEnd) {
      const mid = Math.floor((lowEnd + highEnd) / 2);
      if (normalizeIntentText(rawText.slice(0, mid)).length < nextMatch.start) lowEnd = mid + 1;
      else highEnd = mid;
    }
    rawEnd = Math.min(rawEnd, Math.max(rawStart, lowEnd));
  }
  const segment = rawText.slice(rawStart, rawEnd);
  const amount = extractMoneyRial(segment);
  if (amount != null) return amount;
  // Some users write "1.25 million for the sensor" instead of putting the price after the name.
  const prefix = rawText.slice(Math.max(0, rawStart - 50), rawStart);
  if (/(?:قیمت|هزینه|مبلغ|به مبلغ|با قیمت)/i.test(prefix)) return extractMoneyRial(prefix + " " + segment);
  return null;
}
function repairRowSignature(row) {
  return JSON.stringify({
    type: row.type || "part", title: row.title || "", componentKey: row.componentKey || "",
    serviceCatalogKey: row.serviceCatalogKey || "", serviceKey: row.serviceKey || "",
    expenseCategory: row.expenseCategory || "", costRial: row.costRial ?? null,
    actor: row.actor || "من", odometerKm: row.odometerKm ?? null,
    specs: row.specs || null, componentReplaced: Boolean(row.componentReplaced)
  });
}

async function findDuplicateRepairGroup(rows, env) {
  if (!rows.length) return null;
  const expected = rows.map(repairRowSignature).sort();
  const events = await loadAllEvents(env);
  const groups = new Map();
  for (const event of events) {
    if (!event.repairGroupId) continue;
    if (!groups.has(event.repairGroupId)) groups.set(event.repairGroupId, []);
    groups.get(event.repairGroupId).push(event);
  }
  for (const [id, group] of groups) {
    if (group.length !== rows.length) continue;
    // Do not require the calendar date to match: re-sending the same workshop message
    // tomorrow should still be flagged when driver, odometer and every repair row match.
    const actual = group.map(repairRowSignature).sort();
    if (actual.every((item, index) => item === expected[index])) return { id, events: group };
  }
  return null;
}

function eventDuplicateSignature(event) {
  return JSON.stringify({
    fingerprint: event.metadata?.messageFingerprint || "",
    type: event.type || "", title: normalizeIntentText(event.title || ""),
    date: event.date || String(event.occurredAt || "").slice(0, 10), actor: event.actor || "من",
    odometerKm: event.odometerKm ?? null, costRial: event.costRial ?? null,
    liters: event.liters ?? null, distanceKm: event.distanceKm ?? null,
    componentKey: event.componentKey || "", serviceCatalogKey: event.serviceCatalogKey || "",
    serviceKey: event.serviceKey || "", expenseCategory: event.expenseCategory || "", specs: event.specs || null
  });
}

async function duplicateReviewMessages(env) {
  const events = await loadAllEvents(env);
  const groups = new Map();
  for (const event of events) {
    const signature = eventDuplicateSignature(event);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(event);
  }
  const duplicates = [...groups.values()].filter(group => group.length > 1).sort((a, b) => eventTimestampForReport(b[b.length - 1]) - eventTimestampForReport(a[a.length - 1]));
  if (!duplicates.length) return [{ text: "✅ رویداد تکراری قابل تشخیص پیدا نشد. هیچ داده‌ای تغییر نکرد.\n\nاین بررسی نوع، تاریخ، شخص، کیلومتر، مبلغ، مشخصات قطعه و اثرانگشت پیام را مقایسه می‌کند.", markup: false }];
  const messages = [{ text: `🧹 بررسی رویدادهای احتمالی تکراری\n\nگروه‌های مشکوک: ${formatNum(duplicates.length)}\nهیچ موردی خودکار حذف یا ادغام نمی‌شود. برای هر جفت، جزئیات را بررسی و تصمیم بگیر.`, markup: false }];
  for (const group of duplicates.slice(0, 15)) {
    const keeper = group[0];
    for (const duplicate of group.slice(1, 4)) {
      const summary = event => `${event.title || eventTypeLabel(event.type)} · ${event.jalaliDate || event.date || "—"} · ${event.actor || "من"} · ${event.costRial != null ? formatMoneyToman(event.costRial) : "بدون مبلغ"}`;
      messages.push({ text: `⚠️ جفت احتمالی تکراری\n\nنسخه پیشنهادی برای نگه‌داشتن:\n${summary(keeper)}\nشناسه: <code>${keeper.id.slice(0, 8)}</code>\n\nنسخه احتمالی تکراری:\n${summary(duplicate)}\nشناسه: <code>${duplicate.id.slice(0, 8)}</code>\n\nادغام، فیلدهای خالی نسخهٔ اصلی را تکمیل و نسخهٔ دوم را آرشیو می‌کند. حذف، نسخهٔ دوم را بدون ادغام آرشیو می‌کند.`, markup: { inline_keyboard: [[{ text: "🧩 ادغام در نسخه اول", callback_data: `dupmerge:${keeper.id.slice(0, 8)}:${duplicate.id.slice(0, 8)}` }, { text: "🗑 حذف نسخه دوم", callback_data: `dupdelete:${duplicate.id.slice(0, 8)}` }], [{ text: "🔎 جزئیات اول", callback_data: `evt:${keeper.id.slice(0, 8)}:detail` }, { text: "🔎 جزئیات دوم", callback_data: `evt:${duplicate.id.slice(0, 8)}:detail` }]] } });
    }
  }
  if (duplicates.length > 15) messages.push({ text: "ℹ️ برای خوانایی، فقط ۱۵ گروه اول نمایش داده شد. /duplicates را دوباره اجرا کن.", markup: false });
  return messages;
}

async function mergeDuplicateEvents(keepPrefix, removePrefix, env, editor = "telegram-duplicate-merge") {
  const keepMatch = await getMatchingEvent(keepPrefix, env);
  const removeMatch = await getMatchingEvent(removePrefix, env);
  if (keepMatch.error || removeMatch.error) return `❌ ادغام انجام نشد.\n${keepMatch.error || removeMatch.error}`;
  const keep = keepMatch.event, duplicate = removeMatch.event;
  if (keep.id === duplicate.id || keep.type !== duplicate.type) return "❌ ادغام فقط برای دو رویداد متفاوت از یک نوع مجاز است.";
  const patch = {};
  const fillKeys = ["description", "note", "actor", "odometerKm", "distanceKm", "liters", "costRial", "serviceKey", "serviceLabel", "serviceCatalogKey", "componentKey", "componentName", "componentCategory", "componentMode", "brand", "model", "partNumber", "specs", "quantity", "expenseCategory", "repairGroupId", "ticketDate", "deadlineDate", "ticketNumber", "fineLocation", "officialCurrentAmountRial", "paidAmountRial", "paidAt", "paymentDate", "paymentReference", "repairDescription", "repairCostRial", "resolvedAt", "status"];
  for (const key of fillKeys) {
    const current = keep[key], incoming = duplicate[key];
    if ((current === null || current === undefined || current === "" || (typeof current === "object" && !Array.isArray(current) && Object.keys(current).length === 0)) && incoming !== null && incoming !== undefined && incoming !== "") patch[key] = incoming;
    else if (key === "specs" && current && incoming && typeof current === "object" && typeof incoming === "object") {
      const merged = { ...incoming, ...current };
      if (JSON.stringify(merged) !== JSON.stringify(current)) patch.specs = merged;
    }
  }
  if (keep.type === "fine" && duplicate.paid && !keep.paid) { patch.paid = true; patch.status = "paid"; patch.paidAt = keep.paidAt || duplicate.paidAt || nowTehran().iso; }
  if (duplicate.componentReplaced && !keep.componentReplaced) patch.componentReplaced = true;
  if (Object.keys(patch).length) {
    const updated = await mutateEventByPrefix(keep.id, patch, env, editor);
    if (updated.error) return `❌ به‌روزرسانی نسخهٔ اصلی شکست خورد: ${updated.error}`;
  }
  const archived = await deleteEventByPrefix(duplicate.id, env, editor, "duplicate-merged");
  if (!archived.event) return `⚠️ نسخهٔ اصلی به‌روز شد، اما آرشیو نسخهٔ دوم کامل نشد: ${archived.text}`;
  return `✅ ادغام کامل شد.\nشناسه نسخه اصلی: <code>${keep.id.slice(0, 8)}</code>\nشناسه نسخه آرشیوشده: <code>${duplicate.id.slice(0, 8)}</code>\n\nفیلدهای خالی تکمیل شدند. نسخه دوم برای امکان بازیابی در بایگانی نگهداری می‌شود.`;
}

async function recordRepairJob(rawText, message, env, options = {}) {
  const config = await readConfig(env);
  const raw = String(rawText || "").trim();
  if (!raw) return `🧰 ثبت چندبخشی تعمیرگاه\nنمونه:\n/repairjob بابام امروز کیلومتر 431462؛ ماشین دیشب روشن نشد؛ دیاگ زده شد؛ درجه آب و دور فن تنظیم شد؛ شمع و وایر شمع عوض شدند؛ باتری 12 ولت 60 آمپر برند=نامشخص قیمت 4.5 میلیون تومان؛ ترموستات و محفظه ترموستات تعویض؛ قیمت محفظه 1.5 میلیون تومان؛ هواگیری شد؛ اجرت=... تومان`;
  const rows = makeRepairJobInputs(raw, config, message);
  if (!rows.length) return "هیچ عملیات مشخصی با اطمینان تشخیص داده نشد. نام قطعه/سرویس و فعل انجام‌شده را بنویس؛ نمونه: /repairjob بابام کیلومتر 431462 دیاگ زده شد و شمع تعویض شد.";
  if (!options.skipDuplicateChecks) {
    const priorGroup = await findDuplicateRepairGroup(rows, env);
    if (priorGroup) {
      const originalText = message?.text || `/repairjob ${raw}`;
      const token = await savePendingDuplicate({ kind: "message", text: originalText, message: { date: message?.date || Math.floor(Date.now() / 1000), message_id: message?.message_id, text: originalText, from: { id: message?.from?.id }, chat: { id: message?.chat?.id } }, existingEventIds: priorGroup.events.map(event => event.id) }, env);
      return { text: `🟡 <b>مراجعه تعمیرگاهی شبیه سابقه قبلی است</b>\n\nمراجعه‌ای با تاریخ، راننده، کیلومتر و ترکیب مشابه قطعات/سرویس پیدا شد. هیچ ردیف جدیدی ذخیره نشده است.\n\nشناسه گروه قبلی: <code>${String(priorGroup.id).slice(0, 8)}</code>\nتعداد ردیف‌های قبلی: ${formatNum(priorGroup.events.length)}\n\nاگر مراجعهٔ جداگانه‌ای بوده، ثبت را صریحاً تأیید کن.`, markup: duplicateConfirmationKeyboard(token) };
    }
  }
  const details = [];
  for (const row of rows) {
    const response = await saveEvent(row, env);
    details.push(`${row.type === "part" ? "🔩" : row.type === "service" ? "🧰" : row.type === "issue" ? "⚠️" : "💳"} ${row.title} · ${row.costRial == null ? "مبلغ ثبت نشده" : formatMoneyToman(row.costRial)} · ID ${eventIdFromReply(response) || "ثبت شد"}`);
  }
  const group = rows[0].repairGroupId?.slice(0, 8) || "—";
  const totalKnown = rows.reduce((sum, row) => sum + (Number(row.costRial) || 0), 0);
  return `✅ مراجعه و تعمیر چندبخشی ثبت شد\n\n🧰 تعداد ردیف‌ها: ${formatNum(rows.length)}\n👤 انجام‌دهنده: ${rows[0].actor || "من"}\n⌁ کیلومتر: ${rows[0].odometerKm == null ? "ثبت نشده" : `${formatNum(rows[0].odometerKm)} km`}\n💳 مجموع هزینه‌های مشخص‌شده: ${formatMoneyToman(totalKnown)}\n🧾 شناسه گروه: <code>${group}</code>\n\n${details.join("\n")}\n\n📝 اجرت ثبت نشده مگر اینکه مبلغ آن را صریحاً نوشته باشی. هزینه قطعات نامشخص خالی می‌ماند. برای ویرایش هر ردیف از /detail شناسه استفاده کن.\n\n📌 اطلاعات ناموجود مانند برند ناشناخته و مبلغ نامشخص حدس زده نشد.`;
}


async function updateInterval(raw, env) {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "نمونه: /interval oil 5000 یا /interval engine_oil 5000 180\nعدد اول کیلومتر و عدد دوم (اختیاری) تعداد روز است.";
  const config = await readConfig(env);
  const key = detectServiceKey(parts.slice(0, -1).join(" "), config) || detectServiceKey(parts[0], config);
  const numbers = parts.map(parseFirstNumber).filter(n => Number.isFinite(n) && n >= 0);
  if (!key || !config.serviceIntervals?.[key] || numbers.length < 1) return "کلید سرویس یا عدد بازه شناخته نشد. /config را ببین. نمونه: /interval engine_oil 5000 180";
  const intervalKm = Math.round(numbers[0]);
  const intervalDays = numbers.length > 1 ? Math.round(numbers[1]) : config.serviceIntervals[key].intervalDays;
  const updated = await mutateJsonFile(FILE_CONFIG, env, () => config, current => {
    current.serviceIntervals ||= {};
    current.serviceIntervals[key] ||= {};
    current.serviceIntervals[key].intervalKm = intervalKm;
    current.serviceIntervals[key].intervalDays = intervalDays;
    current.serviceIntervals[key].updatedAt = nowTehran().iso;
    return current;
  });
  return `✅ بازه «${updated.serviceIntervals[key].label || key}» ذخیره شد.\nهر ${intervalKm ? `${formatNum(intervalKm)} کیلومتر` : "بدون بازه کیلومتری"}${intervalDays ? ` یا ${formatNum(intervalDays)} روز` : ""}\nمقادیر قابل تغییرند و یادآور جایگزین دفترچه یا نظر متخصص نیست.`;
}

async function saveEvent(input, env) {
  const occurred = input.occurredAt ? parseOccurredInput(input.occurredAt) : nowTehran();
  const eventsBefore = await loadAllEvents(env);
  const latestOdo = calculateCurrentOdometer(eventsBefore);
  const config = await readConfig(env);
  const occurredEpoch = Date.parse((input.occurredAt ? parseOccurredInput(input.occurredAt) : nowTehran()).iso);
  const previousOdometerEvent = input.type === "odometer" ? eventsBefore.filter(item => item.type === "odometer" && Number.isFinite(Number(item.odometerKm)) && Date.parse(item.occurredAt || item.createdAt || "") <= occurredEpoch).sort((a,b) => Date.parse(a.occurredAt || a.createdAt || "") - Date.parse(b.occurredAt || b.createdAt || "" )).slice(-1)[0] : null;
  const explicitOdo = Number.isFinite(input.odometerKm) && input.odometerKm > 0 ? Math.round(input.odometerKm) : null;
  const metaSource = String(input.description || input.sourceText || "");
  const parsedMeta = extractEventMetadata(metaSource, input.actor, input.note, config.people || []);
  const fingerprintSource = String(input.sourceText || input.description || "").trim();
  const sourceFingerprint = fingerprintSource ? await fingerprintText(fingerprintSource) : null;
  const event = {
    id: crypto.randomUUID(),
    type: input.type || "note",
    title: input.title || "رویداد خودرو",
    description: String(parsedMeta.description || input.description || "").slice(0, 2000),
    actor: parsedMeta.actor || "من",
    note: String(parsedMeta.note || "").slice(0, 2000),
    updatedAt: null,
    revision: 1,
    editHistory: [],
    createdAt: new Date().toISOString(),
    occurredAt: occurred.iso,
    date: occurred.date,
    time: occurred.time,
    jalaliDate: jalaliDateLabel(occurred.date),
    odometerKm: explicitOdo ?? null,
    distanceKm: Number.isFinite(input.distanceKm) ? Math.max(0, Math.round(input.distanceKm * 10) / 10) : null,
    liters: Number.isFinite(input.liters) ? Math.max(0, Math.round(input.liters * 100) / 100) : null,
    costRial: Number.isFinite(input.costRial) ? Math.max(0, Math.round(input.costRial)) : null,
    serviceKey: input.serviceKey || null,
    serviceLabel: input.serviceLabel || null,
    serviceCatalogKey: input.serviceCatalogKey || null,
    componentKey: input.componentKey || null,
    componentName: input.componentName || null,
    componentCategory: input.componentCategory || null,
    componentMode: input.componentMode || null,
    componentReplaced: Boolean(input.componentReplaced),
    brand: input.brand || null,
    model: input.model || null,
    partNumber: input.partNumber || null,
    specs: input.specs || null,
    quantity: Number(input.quantity) > 0 ? Number(input.quantity) : 1,
    expenseCategory: input.expenseCategory || null,
    repairGroupId: input.repairGroupId || null,
    symptom: input.symptom || null,
    fullTank: Boolean(input.fullTank),
    paid: input.type === "fine" ? Boolean(input.paid) : undefined,
    paidAt: input.paidAt || null,
    ticketDate: input.type === "fine" ? (normalizeFlexibleDate(input.ticketDate) || occurred.date) : undefined,
    deadlineDate: input.type === "fine" ? normalizeFlexibleDate(input.deadlineDate) : undefined,
    appealed: input.type === "fine" ? Boolean(input.appealed) : undefined,
    appealDecisionDate: input.type === "fine" ? normalizeFlexibleDate(input.appealDecisionDate) : undefined,
    ticketNumber: input.ticketNumber || extractFineTicketNumber(metaSource),
    fineLocation: input.fineLocation || null,
    officialCurrentAmountRial: Number.isFinite(input.officialCurrentAmountRial) ? input.officialCurrentAmountRial : null,
    paidAmountRial: Number.isFinite(input.paidAmountRial) ? input.paidAmountRial : null,
    paymentReference: input.paymentReference || null,
    status: input.status || (input.type === "issue" ? "open" : input.type === "fine" ? (input.paid ? "paid" : "unpaid") : undefined),
    repairDescription: input.repairDescription || null,
    resolvedAt: input.resolvedAt || null,
    metadata: { source: input.source || "telegram-or-api", ...(sourceFingerprint ? { messageFingerprint: sourceFingerprint } : {}) }
  };
  if ((event.type === "service" || event.type === "part" || event.type === "fuel" || event.type === "wash" || event.type === "issue" || event.type === "repair" || event.type === "expense" || event.type === "fine") && event.odometerKm === null && latestOdo !== null) {
    event.odometerKm = latestOdo;
    event.odometerAutoAssigned = true;
  }
  if (event.type === "trip") {
    event.odometerBeforeKm = latestOdo;
    event.odometerAfterKm = latestOdo !== null && event.distanceKm !== null ? Math.round(latestOdo + event.distanceKm) : null;
  }
  if (event.type === "odometer" && previousOdometerEvent) {
    const delta = Number(event.odometerKm) - Number(previousOdometerEvent.odometerKm);
    if (delta > 0 && delta <= 5000) {
      event.previousOdometerKm = Number(previousOdometerEvent.odometerKm);
      event.distanceActor = event.actor || "من";
      event.deltaSincePreviousKm = delta;
    }
  }
  if (event.type === "service" && event.serviceKey && !config.serviceIntervals?.[event.serviceKey]) event.metadata.intervalWarning = "service key is not configured";
  const month = event.date.slice(0, 7);
  const file = `data/logs/${month}.json`;
  await mutateJsonFile(file, env, () => ({ schemaVersion: 1, month, updatedAt: nowTehran().iso, events: [] }), current => {
    current.events ||= [];
    if (!current.events.some(existing => existing.id === event.id)) current.events.push(event);
    current.events.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    current.updatedAt = nowTehran().iso;
    return current;
  });
  await mutateJsonFile(FILE_INDEX, env, () => ({ schemaVersion: 1, updatedAt: null, months: [] }), current => {
    current.months ||= [];
    if (!current.months.includes(month)) current.months.push(month);
    current.months.sort();
    current.updatedAt = nowTehran().iso;
    return current;
  });
  const id = event.id.slice(0, 8);
  const lines = [`✅ ثبت شد: ${event.title}`, `شناسه: ${id}`, `دسته: ${eventTypeLabel(event.type)} · تاریخ: ${event.jalaliDate}، ساعت ${event.time}`, `انجام‌دهنده: ${event.actor || "من"}`];
  if (event.odometerKm !== null) lines.push(`کیلومتر ثبت‌شده: ${formatNum(event.odometerKm)} km${event.odometerAutoAssigned ? " · خودکار از آخرین کیلومتر معتبر" : ""}`);
  else if (event.type === "issue" || event.type === "repair") lines.push("⚠️ کیلومتر قبلی معتبری پیدا نشد؛ بعد از بررسی صفحه کیلومتر، با /km عدد فعلی را ثبت کن.");
  if (event.deltaSincePreviousKm != null) lines.push(`مسافت از آخرین کیلومتر ثبت‌شده: ${formatNum(event.deltaSincePreviousKm)} km · راننده: ${event.distanceActor || event.actor || "من"}`);
  if (event.distanceKm !== null) lines.push(`مسافت: ${formatNum(event.distanceKm)} km${event.odometerAfterKm !== null ? ` · کارکرد تخمینی جدید: ${formatNum(event.odometerAfterKm)} km` : " · برای تخمین کارکرد، ابتدا /km ثبت کن"}`);
  if (event.liters !== null) lines.push(`سوخت: ${formatNum(event.liters)} لیتر`);
  if (event.costRial !== null) lines.push(`هزینه: ${formatMoneyToman(event.costRial)}`);
  if (event.note) lines.push(`توضیح تکمیلی: ${event.note}`);
  if (event.componentName || event.componentKey) lines.push(`قطعه: ${event.componentName || event.componentKey}${event.componentCategory ? ` · گروه ${event.componentCategory}` : ""}`);
  if (event.brand) lines.push(`برند: ${event.brand}`);
  if (event.model) lines.push(`مدل: ${event.model}`);
  if (event.specs && typeof event.specs === "object") lines.push(`مشخصات: ${Object.entries(event.specs).map(([key,value])=>`${key}=${value}`).join(" · ")}`);
  if (event.repairGroupId) lines.push(`شناسه مراجعه: ${String(event.repairGroupId).slice(0,8)}`);
  if (event.type === "fine") {
    const fine = fineTimeline(event);
    lines.push(`وضعیت جریمه: ${fine.statusLabel}`, `تاریخ جریمه: ${fine.ticketDate || "—"} · گذشت زمان: ${fine.elapsedDays == null ? "—" : `${formatNum(fine.elapsedDays)} روز`}`, `مهلت پیگیری/پرداخت: ${fine.deadlineDate || "نیازمند بررسی"}${fine.daysToDeadline != null ? ` · ${fine.daysToDeadline < 0 ? `${formatNum(Math.abs(fine.daysToDeadline))} روز از مهلت گذشته` : `${formatNum(fine.daysToDeadline)} روز باقی‌مانده`}` : ""}`);
  }
  if (event.type === "service" && event.serviceKey) {
    const interval = config.serviceIntervals?.[event.serviceKey];
    if (interval && event.odometerKm !== null && interval.intervalKm > 0) lines.push(`موعد کیلومتری بعدی: حدود ${formatNum(event.odometerKm + interval.intervalKm)} km (${formatNum(interval.intervalKm)} km دیگر)`);
    else if (interval && interval.intervalDays > 0) lines.push(`یادآور زمانی بعدی: حدود ${formatNum(interval.intervalDays)} روز بعد`);
    if (event.odometerKm === null && interval?.intervalKm > 0) lines.push("⚠️ برای محاسبه کیلومتر سرویس بعدی، اول کیلومتر فعلی را با /km ثبت کن و سرویس را با کیلومتر درست دوباره ثبت کن.");
  }
  lines.push(`✅ ذخیره در GitHub انجام شد.
🌐 داشبورد: ${SITE_URL}
🤖 ربات: ${BOT_URL}
از دکمه‌های زیر پیام برای جزئیات یا مدیریت همین عملیات استفاده کن.`);
  return lines.join("\n");
}

async function operationsReport(raw, env) {
  const arg = normalizeIntentText(raw || "");
  const all = await loadAllEvents(env);
  const now = nowTehran();
  let rows = all.slice().sort((a,b) => eventTimestampForReport(b) - eventTimestampForReport(a));
  let label = "۲۰ عملیات اخیر";
  if (/^(?:all|همه|کل)(?:\s|$)/i.test(arg)) label = "تمام عملیات";
  else if (/^(?:today|امروز)(?:\s|$)/i.test(arg)) {
    rows = rows.filter(e => String(e.date || e.occurredAt || "").slice(0,10) === now.date); label = "عملیات امروز";
  } else if (/^(?:week|هفته|7d)(?:\s|$)/i.test(arg)) {
    const cutoff = Date.now() - 7 * 86400000;
    rows = rows.filter(e => eventTimestampForReport(e) >= cutoff); label = "عملیات ۷ روز اخیر";
  } else if (/^(?:month|ماه)(?:\s|$)/i.test(arg)) {
    rows = rows.filter(e => String(e.date || e.occurredAt || "").slice(0,7) === now.date.slice(0,7)); label = "عملیات ماه جاری";
  } else rows = rows.slice(0,20);
  if (!rows.length) return [{ text: `🗂 ${label}\n\nدر این بازه عملیاتی ثبت نشده است.\nبرای ثبت مورد جدید، از /help استفاده کن.` }];
  const groups = [];
  for (let i = 0; i < rows.length; i += 7) groups.push(rows.slice(i, i + 7));
  return groups.map((group, groupIndex) => {
    const first = groupIndex * 7 + 1;
    const content = group.map((event, index) => {
      const id = String(event.id || "").slice(0,8);
      const date = event.jalaliDate || event.date || "—";
      const amount = Number(event.costRial) > 0 ? `\nهزینه: ${formatMoneyToman(event.costRial)}` : "";
      const value = event.odometerKm != null ? `\nکیلومترشمار: ${formatNum(event.odometerKm)} km` : event.liters != null ? `\nسوخت: ${formatNum(event.liters,1)} لیتر` : event.distanceKm != null ? `\nمسافت: ${formatNum(event.distanceKm)} km` : "";
      const note = event.note ? `\nتوضیح تکمیلی: ${String(event.note).slice(0,90)}` : "";
      return `${first + index}. ${eventTypeEmoji(event.type)} ${event.title || eventTypeLabel(event.type)}\nشناسه: ${id}\nدسته: ${eventTypeLabel(event.type)}\nتاریخ: ${date} · ${event.time || "—"}\nانجام‌دهنده: ${event.actor || "من"}${value}${amount}${note}`;
    }).join("\n\n────────────\n\n");
    const keyboard = { inline_keyboard: group.map(event => [
      { text: `🔎 ${String(event.id).slice(0,8)} · جزئیات`, callback_data: `evt:${String(event.id).slice(0,8)}:detail` },
      { text: "✏️ ویرایش", callback_data: `evt:${String(event.id).slice(0,8)}:edit` },
      { text: "🗑 حذف", callback_data: `evt:${String(event.id).slice(0,8)}:delete` }
    ]) };
    return { text: `🗂 ${label} · ${formatNum(first)} تا ${formatNum(first + group.length - 1)} از ${formatNum(rows.length)}\n\n${content}\n\nبرای تمام سوابق:\n/operations all\nخروجی فایل:\n/export all`, markup: keyboard };
  });
}

function eventTimestampForReport(event) {
  const value = event?.occurredAt || (event?.date ? `${event.date}T${event.time || "12:00"}:00+03:30` : event?.createdAt);
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp) ? stamp : 0;
}

async function peopleCommand(raw, env) {
  const match = String(raw || "").trim().match(/^(add|remove|delete|list|افزودن|حذف|فهرست)?\s*([\s\S]*)$/i);
  const actionRaw = (match?.[1] || "list").toLowerCase();
  const action = /^(add|افزودن)$/i.test(actionRaw) ? "add" : /^(remove|delete|حذف)$/i.test(actionRaw) ? "remove" : "list";
  const name = String(match?.[2] || "").trim().slice(0, 100);
  if (action !== "list" && !name) return "نام شخص را هم وارد کن. نمونه: /people add بابام";
  let config;
  if (action === "list") {
    config = await readConfig(env);
    config.people = Array.isArray(config.people) ? config.people : [];
  } else {
    config = await mutateJsonFile(FILE_CONFIG, env, () => ({ schemaVersion: 1, serviceIntervals: {}, people: [] }), current => {
      current.people = Array.isArray(current.people) ? current.people : [];
      if (action === "add" && !current.people.some(person => normalizeIntentText(person) === normalizeIntentText(name))) current.people.push(name);
      if (action === "remove") current.people = current.people.filter(person => normalizeIntentText(person) !== normalizeIntentText(name));
      current.people.sort((a,b) => String(a).localeCompare(String(b), "fa"));
      current.updatedAt = nowTehran().iso;
      return current;
    });
  }
  if (action === "add") return `✅ شخص «${name}» به فهرست اشخاص اضافه شد.
از این به بعد می‌توانی پیام را با «${name}: ...» شروع کنی یا بنویسی «توسط ${name}».

فهرست فعلی: ${(config.people || []).join("، ") || "خالی"}`;
  if (action === "remove") return `✅ «${name}» از فهرست انتخاب اشخاص حذف شد؛ سوابق قبلی او تغییر نکردند.

فهرست فعلی: ${(config.people || []).join("، ") || "خالی"}`;
  return `👥 اشخاص ثبت‌شده

${(config.people || []).length ? config.people.map((person, i) => `${i+1}. ${person}`).join("\n") : "هنوز شخصی به فهرست اضافه نشده است."}

افزودن: /people add نام شخص
حذف از فهرست: /people remove نام شخص
سوابق قدیمی با حذف شخص از این فهرست پاک نمی‌شوند.`;
}

function extractEventMetadata(source, explicitActor, explicitNote, people = []) {
  let description = String(source || "").trim();
  let actor = String(explicitActor || "").trim();
  let note = String(explicitNote || "").trim();
  const noteMatch = description.match(/(?:توضیح(?:\s*تکمیلی)?|یادداشت|comment|note)\s*[:=：]\s*([\s\S]*?)(?=\s*(?:[|;؛,،·]\s*(?:شخص|توسط|actor|person)\s*[:=：]?|$))/i);
  if (!note && noteMatch) note = noteMatch[1].trim();
  if (noteMatch) description = description.replace(noteMatch[0], " ");
  if (!actor) {
    const known = [...(Array.isArray(people) ? people : [])].map(String).filter(Boolean).sort((a,b) => b.length - a.length);
    for (const person of known) {
      // Support both explicit "Name: event" and natural "Name event" prefixes.
      const prefix = description.match(new RegExp(`^\\s*${escapeRegExp(person)}(?:\\s*(?::|：|[-–—])\\s*|\\s+)`, "i"));
      if (prefix) { actor = person; description = description.slice(prefix[0].length); break; }
    }
  }
  if (!actor) {
    const family = description.match(/^(بابام|بابا|پدرم|پدر|مامانم|مامان|مادرم|مادر|داداشم|داداش|برادرم|برادر|آبجیم|خواهرم|خواهر|همسرم|همسر|زنم|شوهرم|پسرم|دخترم|دوستم|راننده|my dad|my father|my mom|my mother|my brother|my sister)\s*[:：,،-]?\s+/i);
    if (family) { actor = family[1]; description = description.slice(family[0].length); }
  }
  if (!actor) {
    const actionPattern = /برد|بردش|انجام داد|رانندگی|تعویض|عوض|تنظیم|تعمیر|خراب|روشن نشد|نشتی|دیاگ|استارت|زد|گرفت|پر کرد|نصب|شست|کارواش|ثبت کرد|تعویض کرد/i;
    const anywhere = description.match(/(بابام|بابا|پدرم|پدر|مامانم|مامان|مادرم|مادر|داداشم|داداش|برادرم|برادر|آبجیم|خواهرم|خواهر|همسرم|همسر|زنم|شوهرم|پسرم|دخترم|دوستم|راننده|my dad|my father|my mom|my mother|my brother|my sister)(?=[^\n]{0,65}(?:برد|بردش|انجام داد|رانندگی|تعویض|عوض|تنظیم|تعمیر|دیاگ|استارت|زد|گرفت|پر کرد|نصب|شست|کارواش|ثبت کرد))/i);
    if (anywhere) actor = anywhere[1].trim();
    // Handle messages where the actor is written after the action, e.g. "تعمیر ماشین بابام".
    if (!actor) {
      const tokens = [...(Array.isArray(people) ? people : []), "بابام","بابا","پدرم","پدر","مامانم","مامان","مادرم","مادر","داداشم","داداش","برادرم","برادر","آبجیم","خواهرم","خواهر","همسرم","همسر","زنم","شوهرم","پسرم","دخترم","دوستم","راننده","خودم","من"]
        .map(String).filter(Boolean).sort((a,b)=>b.length-a.length);
      for (const person of tokens) {
        const suffix = new RegExp(`(?:^|\\s)(${escapeRegExp(person)})\\s*$`, "i").exec(description);
        if (suffix && actionPattern.test(description.slice(0, suffix.index)) ) {
          actor = /^خودم$|^من$/i.test(person) ? "من" : person;
          description = description.slice(0, suffix.index).trim();
          break;
        }
      }
    }
    if (!actor && /(?:خودم|من)\s+.{0,30}(?:شستم|کارواش|رانندگی کردم|تعمیر کردم)/i.test(description)) actor = "من";
  }
  const actorMatch = description.match(/(?:توسط|از طرف|به\s*نام|انجام(?:\s*دهنده)?|شخص|شخصیت|actor|person|by)\s*[:=：]?\s*([^,;؛|]+?)(?=\s+(?:توضیح|یادداشت|note|comment)\s*[:=：]|[,;؛|]|$)/i);
  if (!actor && actorMatch) actor = actorMatch[1].trim();
  if (actorMatch) description = description.replace(actorMatch[0], " ");
  // Explicit assignment syntax is useful for slash commands and automation clients.
  const assignedActor = description.match(/(?:actor|person|شخص|انجام.?دهنده)\s*=\s*([^,;؛|]+?)(?=\s+(?:توضیح|یادداشت|note|comment)\s*[:=：]|[,;؛|]|$)/i);
  if (!actor && assignedActor) actor = assignedActor[1].trim();
  if (assignedActor) description = description.replace(assignedActor[0], " ");
  const cleaned = description.replace(/[|;؛]+/g, " · ").replace(/\s+·\s+·\s+/g, " · ").replace(/\s+/g, " ").replace(/^\s*[·,،-]+|[·,،-]+\s*$/g, "").trim();
  return { description: cleaned, actor: actor || "من", note: note === "-" ? "" : note };
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function eventTypeEmoji(type) {
  return ({ odometer: "⌁", trip: "↗️", fuel: "⛽", service: "🧰", part: "🔩", expense: "💳", fine: "🚦", wash: "🫧", issue: "⚠️", repair: "🛠️", note: "📝" })[type] || "🚘";
}
function formatEventDetails(event) {
  const lines = [`${eventTypeEmoji(event.type)} جزئیات رویداد خودرو`, `عنوان: ${event.title || eventTypeLabel(event.type)}`, `شناسه: ${event.id}`, `دسته: ${eventTypeLabel(event.type)}`, `تاریخ: ${event.jalaliDate || event.date || "—"} · ساعت ${event.time || "—"}`, `انجام‌دهنده: ${event.actor || "من"}`];
  if (event.description) lines.push(`شرح عملیات: ${event.description}`);
  if (event.note) lines.push(`توضیح تکمیلی: ${event.note}`);
  if (event.odometerKm != null) lines.push(`کیلومترشمار: ${formatNum(event.odometerKm)} km`);
  if (event.deltaSincePreviousKm != null) lines.push(`مسافت از ثبت قبلی: ${formatNum(event.deltaSincePreviousKm)} km · به نام ${event.distanceActor || event.actor || "من"}`);
  if (event.distanceKm != null) lines.push(`مسافت: ${formatNum(event.distanceKm)} km`);
  if (event.liters != null) lines.push(`سوخت: ${formatNum(event.liters)} لیتر${event.fullTank ? " · باک کامل" : ""}`);
  if (Number(event.costRial) > 0) lines.push(`مبلغ: ${formatMoneyToman(event.costRial)}`);
  if (event.type === "fine") {
    const timeline = fineTimeline(event);
    lines.push(`وضعیت جریمه: ${timeline.statusLabel}`, `تاریخ جریمه: ${timeline.ticketDate || "—"} · ${timeline.elapsedDays == null ? "—" : `${formatNum(timeline.elapsedDays)} روز گذشته`}`, `مهلت محاسباتی: ${timeline.deadlineDate || "نامشخص"}`);
    if (event.ticketNumber) lines.push(`شماره قبض: <code>${event.ticketNumber}</code>`);
    if (event.paid) lines.push(`تاریخ پرداخت: ${event.paymentDate || event.paidAt || "ثبت نشده"}`, `مبلغ پرداختی: ${event.paidAmountRial ? formatMoneyToman(event.paidAmountRial) : "—"}`, `کد پیگیری پرداخت: ${event.paymentReference || "ثبت نشده"}`);
    if (timeline.potentialAmountRial != null) lines.push(`برآورد هشدار احتمالی: ${formatMoneyToman(timeline.potentialAmountRial)} (غیرقطعی؛ استعلام رسمی لازم است)`);
  }
  if (event.type === "issue") lines.push(`وضعیت خرابی: ${event.status === "fixed" ? "✅ رفع‌شده" : "🟠 باز"}`);
  if (event.componentName || event.componentKey) lines.push(`قطعه: ${event.componentName || event.componentKey} · گروه: ${event.componentCategory || "نامشخص"} · حالت: ${event.componentMode || "عمرمحور/شرطی"}`);
  if (event.brand) lines.push(`برند: ${event.brand}`);
  if (event.model) lines.push(`مدل: ${event.model}`);
  if (event.partNumber) lines.push(`کد فنی: ${event.partNumber}`);
  if (event.specs && typeof event.specs === "object") lines.push(`مشخصات فنی: ${Object.entries(event.specs).map(([k,v])=>`${k}=${v}`).join(" · ")}`);
  if (event.quantity) lines.push(`تعداد: ${formatNum(event.quantity)}`);
  if (event.repairGroupId) lines.push(`شناسه گروه تعمیرگاه: <code>${event.repairGroupId}</code>`);
  if (event.serviceLabel) lines.push(`سرویس/قطعه: ${event.serviceLabel}`);
  if (event.repairDescription) lines.push(`شرح تعمیر: ${event.repairDescription}`);
  if (event.repairCostRial) lines.push(`هزینه تعمیر: ${formatMoneyToman(event.repairCostRial)}`);
  if (event.createdAt) lines.push(`زمان ثبت: ${event.createdAt}`);
  if (event.updatedAt) lines.push(`آخرین ویرایش: ${event.updatedAt} · نسخه ${event.revision || 1}`);
  if (Array.isArray(event.editHistory) && event.editHistory.length) {
    lines.push(`تاریخچه تغییرات: ${event.editHistory.length} ویرایش ثبت‌شده`);
    for (const edit of event.editHistory.slice(-3).reverse()) {
      const keys = Object.keys(edit.after || {});
      lines.push(`↳ ${edit.at || "—"} · ${edit.by || "کاربر"} · ${keys.join("، ") || "ویرایش"}`);
    }
  }
  lines.push(`🌐 سایت: ${SITE_URL}`, `🤖 ربات: ${BOT_URL}`);
  return lines.join("\n");
}

async function findEventByPrefix(prefix, env) {
  const query = String(prefix || "").trim().replace(/[^a-f0-9-]/gi, "");
  if (query.length < 6) return null;
  const matches = (await loadAllEvents(env)).filter(event => String(event.id || "").toLowerCase().startsWith(query.toLowerCase()));
  return matches.length === 1 ? matches[0] : null;
}
async function getMatchingEvent(prefix, env) {
  const query = String(prefix || "").trim().replace(/[^a-f0-9-]/gi, "");
  if (query.length < 6) return { error: "شناسه باید حداقل ۶ حرف/عدد داشته باشد؛ نمونه: /detail a1b2c3d4" };
  const matches = (await loadAllEvents(env)).filter(event => String(event.id || "").toLowerCase().startsWith(query.toLowerCase()));
  if (!matches.length) return { error: "رویداد فعال پیدا نشد. شاید قبلاً حذف شده باشد؛ برای بازگردانی /restore را بررسی کن." };
  if (matches.length > 1) return { error: "شناسه مبهم است؛ حداقل ۸ کاراکتر اول شناسه را وارد کن." };
  return { event: matches[0] };
}

async function mutateEventByPrefix(prefix, patch, env, editor = "telegram") {
  const match = await getMatchingEvent(prefix, env);
  if (match.error) return { error: match.error };
  const target = match.event;
  const month = String(target.date || target.occurredAt || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "ماه رویداد معتبر نیست؛ تغییر متوقف شد." };
  const filePath = `data/logs/${month}.json`;
  let updatedEvent = null;
  await mutateJsonFile(filePath, env, () => ({ schemaVersion: 1, month, events: [] }), current => {
    current.events ||= [];
    const event = current.events.find(item => item.id === target.id);
    if (!event) throw new Error("Event disappeared while updating; reload and retry.");
    const before = {};
    for (const key of Object.keys(patch)) before[key] = event[key] ?? null;
    for (const [key, value] of Object.entries(patch)) event[key] = value;
    event.updatedAt = nowTehran().iso;
    event.revision = Math.max(1, Number(event.revision) || 1) + 1;
    event.editHistory = Array.isArray(event.editHistory) ? event.editHistory : [];
    event.editHistory.push({ at: event.updatedAt, by: editor, before, after: Object.fromEntries(Object.keys(patch).map(key => [key, event[key] ?? null])) });
    if (event.editHistory.length > 20) event.editHistory = event.editHistory.slice(-20);
    current.updatedAt = nowTehran().iso;
    updatedEvent = structuredClone(event);
    return current;
  });
  await mutateJsonFile(FILE_INDEX, env, () => ({ months: [] }), current => { current.updatedAt = nowTehran().iso; return current; });
  return { event: updatedEvent };
}

async function annotateEventCommand(raw, env) {
  const match = raw.match(/^(\S+)\s+([\s\S]+)$/);
  if (!match) return `نمونه: /annotate a1b2c3d4 توضیح تکمیلی عملیات\nبرای حذف توضیح بنویس: /annotate a1b2c3d4 -`;
  const result = await mutateEventByPrefix(match[1], { note: match[2].trim() === "-" ? "" : match[2].trim().slice(0, 2000) }, env);
  return result.error || `✅ توضیح رویداد ${result.event.id.slice(0,8)} به‌روز شد.

${formatEventDetails(result.event)}`;
}
async function actorEventCommand(raw, env) {
  const match = raw.match(/^(\S+)\s+([\s\S]+)$/);
  if (!match) return `نمونه: /actor a1b2c3d4 بابام\nبرای حالت پیش‌فرض بنویس: /actor a1b2c3d4 من`;
  const actor = match[2].trim().slice(0, 100) || "من";
  const result = await mutateEventByPrefix(match[1], { actor: actor === "-" ? "من" : actor }, env);
  return result.error || `✅ شخص انجام‌دهنده به «${result.event.actor}» تغییر کرد.

${formatEventDetails(result.event)}`;
}
function parseEditPatch(raw) {
  const chunks = String(raw || "").split(/[|؛;]/).map(x => x.trim()).filter(Boolean);
  const patch = {};
  const labels = {
    title: "title", عنوان: "title", name: "title",
    description: "description", desc: "description", شرح: "description", متن: "description", عملیات: "description",
    note: "note", comment: "note", توضیح: "note", یادداشت: "note",
    actor: "actor", person: "actor", شخص: "actor", انجامدهنده: "actor", انجام_دهنده: "actor",
    cost: "costRial", amount: "costRial", price: "costRial", مبلغ: "costRial", هزینه: "costRial",
    km: "odometerKm", odometer: "odometerKm", کیلومتر: "odometerKm", کارکرد: "odometerKm",
    liters: "liters", liter: "liters", لیتر: "liters",
    distance: "distanceKm", مسافت: "distanceKm",
    paid: "paid", پرداخت: "paid",
    status: "status", وضعیت: "status"
  };
  for (const chunk of chunks) {
    const m = chunk.match(/^([^:=：]+)\s*[:=：]\s*([\s\S]*)$/);
    if (!m) { patch.description = chunk.slice(0, 2000); continue; }
    const key = labels[normalizeIntentText(m[1]).replace(/[\s-]+/g, "_")];
    if (!key) continue;
    const value = m[2].trim();
    if (key === "title" || key === "description" || key === "note" || key === "actor") patch[key] = key === "actor" && (!value || value === "-") ? "من" : (value === "-" && key === "note" ? "" : value.slice(0, 2000));
    else if (key === "costRial") {
      const extracted = extractMoneyRial(value);
      const n = extracted !== null ? extracted : parseFirstNumber(value);
      if (n !== null && Number.isFinite(n) && n >= 0) patch.costRial = extracted !== null ? extracted : Math.round(n * 10);
    } else if (["odometerKm", "liters", "distanceKm"].includes(key)) {
      const n = parseFirstNumber(value);
      if (n !== null && Number.isFinite(n) && n >= 0) patch[key] = key === "odometerKm" ? Math.round(n) : n;
    } else if (key === "paid") {
      if (/^(1|true|yes|بله|پرداخت(?:شده)?|بله پرداخت شده)$/i.test(value)) patch.paid = true;
      else if (/^(0|false|no|خیر|پرداخت.?نشده|بدهکار)$/i.test(value)) patch.paid = false;
    } else if (key === "status") {
      if (/^(fixed|closed|رفع.?شده|بسته|حل.?شده)$/i.test(value)) patch.status = "fixed";
      else if (/^(open|باز|در.?انتظار)$/i.test(value)) patch.status = "open";
    }
  }
  return patch;
}
async function editEventCommand(raw, env) {
  const match = raw.match(/^(\S+)\s+([\s\S]+)$/);
  if (!match) return "نمونه: /edit a1b2c3d4 عنوان=سوخت‌گیری | شرح=بنزین برای سفر | توضیح=سفر شمال | شخص=بابام | مبلغ=700000 تومان | کیلومتر=431400";
  const patch = parseEditPatch(match[2]);
  if (!Object.keys(patch).length) return "هیچ فیلد معتبری تشخیص داده نشد. از عنوان، شرح، توضیح، شخص، مبلغ، کیلومتر، لیتر، مسافت، پرداخت یا وضعیت استفاده کن.";
  const original = await getMatchingEvent(match[1], env);
  if (original.error) return original.error;
  if (patch.paid !== undefined && original.event.type === "fine") patch.paidAt = patch.paid ? nowTehran().iso : null;
  const result = await mutateEventByPrefix(match[1], patch, env);
  return result.error || `✅ رویداد ویرایش شد · نسخه ${result.event.revision}

${formatEventDetails(result.event)}`;
}

async function deleteEventByPrefix(prefix, env, deletedBy = "telegram", deletionReason = "user-request") {
  const match = await getMatchingEvent(prefix, env);
  if (match.error) return { text: match.error, event: null };
  const event = match.event;
  const month = String(event.date || event.occurredAt || "").slice(0, 7);
  const filePath = `data/logs/${month}.json`;
  const deletedAt = nowTehran().iso;
  // Archive first so a write failure cannot destroy the only copy of a record.
  await mutateJsonFile(FILE_DELETED_EVENTS, env, () => ({ schemaVersion: 1, updatedAt: null, events: [] }), current => {
    current.events ||= [];
    if (!current.events.some(item => item.id === event.id)) current.events.push({ ...event, deletedAt, deletedBy, deletionReason, archiveVersion: 1 });
    current.updatedAt = deletedAt;
    return current;
  });
  await mutateJsonFile(filePath, env, () => ({ schemaVersion: 1, month, events: [] }), current => {
    current.events = (current.events || []).filter(item => item.id !== event.id);
    current.updatedAt = deletedAt;
    return current;
  });
  await mutateJsonFile(FILE_INDEX, env, () => ({ months: [] }), current => { current.updatedAt = deletedAt; return current; });
  return { text: `🗑 عملیات حذف شد و برای امکان بازیابی در بایگانی نگهداری شد.
شناسه: ${event.id.slice(0,8)}
عنوان: ${event.title}
شخص: ${event.actor || "من"}

برای بازگردانی: /restore ${event.id.slice(0,8)}
🌐 ${SITE_URL}`, event };
}
async function restoreDeletedEvent(prefix, env) {
  const query = String(prefix || "").trim().replace(/[^a-f0-9-]/gi, "");
  if (query.length < 6) return "نمونه: /restore a1b2c3d4";
  const archive = await readJsonFile(FILE_DELETED_EVENTS, env, { events: [] });
  const matches = (archive.events || []).filter(event => String(event.id || "").toLowerCase().startsWith(query.toLowerCase()));
  if (matches.length !== 1) return matches.length ? "شناسه مبهم است؛ کاراکترهای بیشتری وارد کن." : "رویداد در بایگانی پیدا نشد.";
  const event = matches[0];
  const month = String(event.date || event.occurredAt || "").slice(0,7);
  if (!/^\d{4}-\d{2}$/.test(month)) return "تاریخ رویداد بایگانی‌شده معتبر نیست؛ بازگردانی متوقف شد.";
  delete event.deletedAt; delete event.deletedBy; delete event.deletionReason; delete event.archiveVersion;
  await mutateJsonFile(`data/logs/${month}.json`, env, () => ({ schemaVersion: 1, month, events: [] }), current => {
    current.events ||= [];
    if (!current.events.some(item => item.id === event.id)) current.events.push(event);
    current.events.sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt)));
    current.updatedAt = nowTehran().iso;
    return current;
  });
  await mutateJsonFile(FILE_DELETED_EVENTS, env, () => ({ events: [] }), current => { current.events = (current.events || []).filter(item => item.id !== event.id); current.updatedAt = nowTehran().iso; return current; });
  await mutateJsonFile(FILE_INDEX, env, () => ({ months: [] }), current => { current.months ||= []; if (!current.months.includes(month)) current.months.push(month); current.months.sort(); current.updatedAt = nowTehran().iso; return current; });
  return `♻️ رویداد بازیابی شد.

${formatEventDetails(event)}`;
}

async function loadAllEvents(env) {
  const index = await readJsonFile(FILE_INDEX, env, { months: [] });
  const months = Array.isArray(index.months) ? index.months.slice().sort() : [];
  const results = await Promise.all(months.map(month => getMonth(month, env).catch(error => {
    console.error(`month read failed ${month}`, error?.message || error);
    return { events: [] };
  })));
  const all = results.flatMap(result => Array.isArray(result.events) ? result.events : []);
  const seen = new Set();
  return all.filter(event => {
    if (!event?.id || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function calculateCurrentOdometer(events) {
  let current = null;
  const timeline = [...events].filter(e => e.type === "odometer" || e.type === "trip").sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const event of timeline) {
    if (event.type === "odometer" && Number.isFinite(event.odometerKm)) current = Math.round(event.odometerKm);
    else if (event.type === "trip" && Number.isFinite(event.distanceKm) && event.distanceKm >= 0 && current !== null) current = Math.round((current + event.distanceKm) * 10) / 10;
  }
  return current;
}

function calculateDistanceEntries(events, ownershipConfig = null) {
  const allOdometers = [...events].filter(e => e.type === "odometer" && e.odometerKm !== null && e.odometerKm !== undefined && Number.isFinite(Number(e.odometerKm)))
    .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  // Treat a newer lower reading as a correction checkpoint so impossible prior deltas do not remain in totals.
  let correctionIndex = 0;
  for (let i = 1; i < allOdometers.length; i++) if (Number(allOdometers[i].odometerKm) < Number(allOdometers[i - 1].odometerKm)) correctionIndex = i;
  const odometers = allOdometers.slice(correctionIndex);
  const coveredTrips = new Set();
  const result = [];
  const ownership = { purchaseOdometerKm: Number(ownershipConfig?.purchaseOdometerKm ?? ownershipConfig?.baselineOdometerKm ?? DEFAULT_PURCHASE_ODOMETER_KM), purchaseDate: ownershipConfig?.purchaseDate || null, defaultActor: String(ownershipConfig?.historicalActor || ownershipConfig?.defaultActor || "من") };
  const first = odometers[0];
  if (first && Number.isFinite(ownership.purchaseOdometerKm) && ownership.purchaseOdometerKm > 0) {
    const startKm = ownership.purchaseOdometerKm;
    const endKm = Number(first.odometerKm);
    const baselineDistance = endKm - startKm;
    if (baselineDistance > 0) {
      const purchaseTime = ownership.purchaseDate ? Date.parse(`${ownership.purchaseDate}T00:00:00+03:30`) : NaN;
      const firstTime = Date.parse(first.occurredAt || first.createdAt || "");
      const historicalTrips = events.filter(trip => trip.type === "trip" && Number(trip.distanceKm) > 0 && Number.isFinite(Date.parse(trip.occurredAt || "")) && Date.parse(trip.occurredAt) <= firstTime && (!Number.isFinite(purchaseTime) || Date.parse(trip.occurredAt) >= purchaseTime) && (correctionIndex === 0 || Date.parse(trip.occurredAt) >= firstTime));
      const tripTotal = historicalTrips.reduce((sum, trip) => sum + Number(trip.distanceKm || 0), 0);
      if (tripTotal > 0 && tripTotal <= baselineDistance) {
        for (const trip of historicalTrips) {
          coveredTrips.add(trip.id);
          result.push({ date: trip.date || String(trip.occurredAt).slice(0, 10), occurredAt: trip.occurredAt, distanceKm: Number(trip.distanceKm), actor: String(trip.actor || "من").trim() || "من", source: "ownership_historical_trip", eventId: trip.id, estimatedHistorical: true, fromOdometerKm: startKm, toOdometerKm: endKm });
        }
      }
      const residual = baselineDistance - (tripTotal > 0 && tripTotal <= baselineDistance ? tripTotal : 0);
      if (residual > 0) result.push({ date: ownership.purchaseDate || null, occurredAt: ownership.purchaseDate ? `${ownership.purchaseDate}T12:00:00+03:30` : null, distanceKm: residual, actor: ownership.defaultActor.trim() || "من", source: "ownership_baseline", eventId: first.id, estimatedHistorical: true, fromOdometerKm: startKm, toOdometerKm: endKm });
    }
  }
  for (let i = 1; i < odometers.length; i++) {
    const previous = odometers[i - 1], current = odometers[i];
    const delta = Number(current.odometerKm) - Number(previous.odometerKm);
    if (delta <= 0 || delta > 5000) continue;
    const start = Date.parse(previous.occurredAt), end = Date.parse(current.occurredAt);
    const trips = events.filter(trip => trip.type === "trip" && Date.parse(trip.occurredAt) > start && Date.parse(trip.occurredAt) <= end && Number(trip.distanceKm) > 0)
      .sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt)));
    const tripDistance = trips.reduce((sum, trip) => sum + Number(trip.distanceKm || 0), 0);
    trips.forEach(trip => coveredTrips.add(trip.id));
    if (trips.length && tripDistance <= delta) {
      for (const trip of trips) result.push({ date: trip.date || String(trip.occurredAt).slice(0, 10), occurredAt: trip.occurredAt, distanceKm: Number(trip.distanceKm), actor: String(trip.actor || "من").trim() || "من", source: "trip_within_odometer", eventId: trip.id, fromOdometerKm: Number(previous.odometerKm), toOdometerKm: Number(current.odometerKm) });
      const residual = delta - tripDistance;
      if (residual > 0) result.push({ date: current.date || String(current.occurredAt).slice(0, 10), occurredAt: current.occurredAt, distanceKm: residual, actor: String(current.actor || "من").trim() || "من", source: "odometer_residual", fromId: previous.id, toId: current.id, fromOdometerKm: Number(previous.odometerKm), toOdometerKm: Number(current.odometerKm) });
    } else {
      result.push({ date: current.date || String(current.occurredAt).slice(0, 10), occurredAt: current.occurredAt, distanceKm: delta, actor: String(current.actor || "من").trim() || "من", source: "odometer_delta", fromId: previous.id, toId: current.id, fromOdometerKm: Number(previous.odometerKm), toOdometerKm: Number(current.odometerKm) });
    }
  }
  for (const event of events) {
    if (event.type === "trip" && !coveredTrips.has(event.id) && Number(event.distanceKm) > 0) {
      result.push({ date: event.date || String(event.occurredAt).slice(0, 10), occurredAt: event.occurredAt, distanceKm: Number(event.distanceKm), actor: String(event.actor || "من").trim() || "من", source: "trip", eventId: event.id });
    }
  }
  return result.sort((a, b) => (Date.parse(a.occurredAt || "") || 0) - (Date.parse(b.occurredAt || "") || 0));
}

async function dueReport(env) {
  const [events, config] = await Promise.all([loadAllEvents(env), readConfig(env)]);
  const currentOdo = calculateCurrentOdometer(events);
  const due = calculateDueItems(events, config, currentOdo, nowTehran());
  if (!due.length) return `✅ سرویس نزدیک موعد یا عقب‌افتاده‌ای با داده‌های فعلی پیدا نشد.\nکارکرد معتبر: ${currentOdo === null ? "ثبت نشده؛ با /km ثبت کن" : `${formatNum(currentOdo)} km`}\nبرای سرویس‌های بدون سابقه، مبنای کیلومتری ${formatNum(getOwnershipSettings(config).purchaseOdometerKm)} km استفاده می‌شود؛ اگر تاریخ خرید مشخص نیست، روزهای گذشته حدس زده نمی‌شوند.`;
  const labels = { critical: '🔴 بحرانی', overdue: '⛔ عقب‌افتاده', due: '🟠 موعد رسیده', upcoming: '🟡 نزدیک موعد' };
  return `🧰 وضعیت سرویس‌های پژو ۲۰۶\nکارکرد فعلی: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}\n\n` + due.map(item => `${labels[item.stage] || '🔎 بررسی'} · ${item.label}${item.baseline ? ' · سابقه ندارد؛ مبنا خرید' : ''}\n${item.remainingKm === null ? "موعد کیلومتری قابل محاسبه نیست" : item.remainingKm <= 0 ? `${formatNum(Math.abs(item.remainingKm))} km از موعد گذشته` : `${formatNum(item.remainingKm)} km تا موعد`}${item.remainingDays === null ? (item.baseline && item.intervalDays > 0 ? '\nتاریخ مبنا ثبت نشده؛ روزهای گذشته حدس زده نمی‌شوند' : '') : `\n${item.remainingDays <= 0 ? `${formatNum(Math.abs(item.remainingDays))} روز از موعد زمانی گذشته` : `${formatNum(item.remainingDays)} روز تا موعد زمانی`}`}`).join("\n\n") + "\n\nترتیب از بحرانی‌ترین مورد شروع می‌شود. بازه‌ها یادآورند؛ مشخصات دفترچه و بازدید تعمیرکار ملاک نهایی است.";
}

function calculateDueItems(events, config, currentOdo, now, options = {}) {
  const today = now.date;
  const ownership = getOwnershipSettings(config);
  const items = [];
  const stageRank = { critical: 0, overdue: 1, due: 2, upcoming: 3, ok: 4 };
  const stageFor = (remainingKm, remainingDays, intervalKm, intervalDays) => {
    const kmOver = remainingKm != null && remainingKm < 0 ? Math.abs(remainingKm) : 0;
    const daysOver = remainingDays != null && remainingDays < 0 ? Math.abs(remainingDays) : 0;
    if ((intervalKm > 0 && kmOver >= Math.max(1000, intervalKm * .2)) || daysOver >= 30) return 'critical';
    if ((remainingKm != null && remainingKm <= 0) || (remainingDays != null && remainingDays <= 0)) return 'overdue';
    if ((remainingKm != null && intervalKm > 0 && remainingKm <= Math.max(100, intervalKm * .02)) || (remainingDays != null && remainingDays <= 3)) return 'due';
    if ((remainingKm != null && intervalKm > 0 && remainingKm <= Math.max(500, intervalKm * .1)) || (remainingDays != null && remainingDays <= 14)) return 'upcoming';
    return 'ok';
  };
  for (const [key, interval] of Object.entries(config.serviceIntervals || {})) {
    const previous = events.filter(e =>
      (e.type === 'service' && (e.serviceKey === key || e.componentKey === key || e.serviceCatalogKey === key)) ||
      ((e.type === 'part' || e.type === 'repair' || (e.type === 'issue' && e.status === 'fixed')) && e.status !== 'open' && (e.serviceKey === key || e.componentKey === key || e.serviceCatalogKey === key) && (e.componentReplaced || e.type === 'repair' || e.status === 'fixed'))
    ).sort((a,b) => eventTimestampForReport(b)-eventTimestampForReport(a))[0] || null;
    const baseline = !previous;
    const kmInterval = Number(interval.intervalKm) || 0;
    const dayInterval = Number(interval.intervalDays) || 0;
    const refKm = previous ? (previous.odometerKm != null && Number.isFinite(Number(previous.odometerKm)) ? Number(previous.odometerKm) : null) : ownership.purchaseOdometerKm;
    const refDate = previous?.date || (previous?.occurredAt ? String(previous.occurredAt).slice(0,10) : null) || (baseline ? ownership.purchaseDate : null);
    const remainingKm = kmInterval > 0 && currentOdo != null && refKm != null ? Math.round(refKm + kmInterval - currentOdo) : null;
    const dueDate = dayInterval > 0 && refDate ? addDaysToDate(refDate, dayInterval) : null;
    const remainingDays = dueDate ? daysBetween(today, dueDate) : null;
    const stage = stageFor(remainingKm, remainingDays, kmInterval, dayInterval);
    if (stage !== 'ok' || options.includeAll) items.push({ key, label: interval.label || key, stage, stageRank: stageRank[stage], overdue: stage === 'overdue' || stage === 'critical', remainingKm, remainingDays, kmText: remainingKm === null ? `موعد کیلومتری: دادهٔ کافی در دست نیست${baseline ? `؛ مبنای خرید ${formatNum(ownership.purchaseOdometerKm)} km است` : ''}` : remainingKm <= 0 ? `${formatNum(Math.abs(remainingKm))} km از موعد گذشته` : `${formatNum(remainingKm)} km تا موعد`, daysText: remainingDays === null ? (baseline && dayInterval > 0 ? 'تاریخ خرید/سرویس ثبت نشده؛ روزهای سپری‌شده حدس زده نمی‌شوند' : '') : remainingDays <= 0 ? `${formatNum(Math.abs(remainingDays))} روز از موعد زمانی گذشته` : `${formatNum(remainingDays)} روز تا موعد زمانی`, lastEventId: previous?.id || `purchase-baseline-${key}`, baseline, intervalKm: kmInterval, intervalDays: dayInterval, referenceOdometerKm: refKm, referenceDate: refDate });
  }
  for (const [key, item] of Object.entries(config.partCatalog?.items || {})) {
    if (item.mode !== 'periodic' || config.serviceIntervals?.[key]) continue;
    const previous = events.filter(e => (e.componentKey === key || e.serviceKey === key || e.serviceCatalogKey === key) && (e.componentReplaced || e.type === 'service' || e.type === 'repair' || (e.type === 'issue' && e.status === 'fixed')) && e.status !== 'open').sort((a,b)=>eventTimestampForReport(b)-eventTimestampForReport(a))[0] || null;
    const baseline = !previous;
    const kmInterval = Number(item.intervalKm) || 0;
    const dayInterval = Number(item.intervalDays) || 0;
    const refKm = previous ? (previous.odometerKm != null && Number.isFinite(Number(previous.odometerKm)) ? Number(previous.odometerKm) : null) : ownership.purchaseOdometerKm;
    const refDate = previous?.date || (previous?.occurredAt ? String(previous.occurredAt).slice(0,10) : null) || (baseline ? ownership.purchaseDate : null);
    const kmSince = currentOdo != null && refKm != null ? currentOdo - refKm : null;
    const remainingKm = kmInterval > 0 && kmSince != null ? Math.round(kmInterval-kmSince) : null;
    const dueDate = dayInterval > 0 && refDate ? addDaysToDate(refDate,dayInterval) : null;
    const remainingDays = dueDate ? daysBetween(today,dueDate) : null;
    const stage = stageFor(remainingKm,remainingDays,kmInterval,dayInterval);
    if (stage !== 'ok' || options.includeAll) items.push({ key, label:item.label || key, stage, stageRank:stageRank[stage], overdue:stage==='overdue'||stage==='critical', remainingKm, remainingDays, kmText:remainingKm===null?'موعد کیلومتری قابل محاسبه نیست':remainingKm<=0?`${formatNum(Math.abs(remainingKm))} km از موعد گذشته`:`${formatNum(remainingKm)} km تا موعد`, daysText:remainingDays===null?(baseline&&dayInterval>0?'تاریخ خرید/نصب مشخص نیست':''):remainingDays<=0?`${formatNum(Math.abs(remainingDays))} روز از موعد گذشته`:`${formatNum(remainingDays)} روز تا موعد زمانی`, lastEventId:previous?.id || `purchase-baseline-${key}`, baseline, intervalKm:kmInterval, intervalDays:dayInterval, referenceOdometerKm:refKm, referenceDate:refDate, component:true });
  }
  return items.sort((a,b)=>(a.stageRank ?? stageRank[a.stage] ?? 9)-(b.stageRank ?? stageRank[b.stage] ?? 9) || Math.min(a.remainingKm ?? Infinity,(a.remainingDays ?? Infinity)*100)-Math.min(b.remainingKm ?? Infinity,(b.remainingDays ?? Infinity)*100));
}

async function runDueReminders(env) {
  if (!env.ALLOWED_TELEGRAM_USER_ID) return { sent: 0, reason: 'ALLOWED_TELEGRAM_USER_ID is not configured' };
  const events = await loadAllEvents(env);
  const config = await readConfig(env);
  const currentOdo = calculateCurrentOdometer(events);
  const due = calculateDueItems(events, config, currentOdo, nowTehran(), { includeAll: true });
  const state = await readJsonFile(FILE_REMINDERS, env, { sent: {} });
  state.sent = state.sent && typeof state.sent === 'object' ? state.sent : {};
  const rank = { ok: 0, upcoming: 1, due: 2, overdue: 3, critical: 4 };
  const now = nowTehran();
  const alertLines = [];
  const activeCycles = new Set();
  for (const item of due) {
    const cycleKey = `${item.key}:${item.lastEventId}`;
    activeCycles.add(cycleKey);
    const previous = state.sent[cycleKey];
    const previousStage = typeof previous === 'string' ? previous : previous?.stage || 'ok';
    if (item.stage === 'ok') {
      if (previous) { state.sent[cycleKey] = { stage: 'ok', changedAt: now.iso, notifiedStage: previous?.notifiedStage || previousStage }; }
      continue;
    }
    const firstAlert = !previous || previousStage === 'ok';
    const escalation = rank[item.stage] > (rank[previousStage] ?? 0);
    if (firstAlert || escalation) {
      const icon = item.stage === 'critical' ? '🆘' : item.stage === 'overdue' ? '🔴' : item.stage === 'due' ? '🟠' : '🟡';
      alertLines.push(`${icon} <b>${escapeTelegramText(item.label)}</b> · ${({ upcoming:'نزدیک موعد', due:'موعد رسیده', overdue:'عقب‌افتاده', critical:'بحرانی' })[item.stage]}${item.baseline ? ' · سابقه ثبت نشده؛ مبنا خرید' : ''}\n${escapeTelegramText(item.kmText)}${item.daysText ? `\n${escapeTelegramText(item.daysText)}` : ''}`);
      state.sent[cycleKey] = { stage: item.stage, notifiedStage: item.stage, sentAt: now.iso, changedAt: now.iso };
    } else if (rank[item.stage] < (rank[previousStage] ?? 0)) {
      // Adjusting odometer/service dates can de-escalate a stage; store the lower state without notifying.
      state.sent[cycleKey] = { ...(typeof previous === 'object' ? previous : {}), stage: item.stage, changedAt: now.iso };
    }
  }
  // Prune stale reminder cycles while retaining the current stage for current maintenance items.
  for (const key of Object.keys(state.sent)) {
    if (!activeCycles.has(key)) delete state.sent[key];
  }
  await mutateJsonFile(FILE_REMINDERS, env, () => ({ sent: {} }), current => ({ ...current, sent: state.sent, updatedAt: now.iso }));
  const documentAlerts = await collectPrivateDocumentExpiryAlerts(env, now);
  const allAlertLines = [...alertLines, ...documentAlerts.lines];
  if (allAlertLines.length) {
    await sendText(env, env.ALLOWED_TELEGRAM_USER_ID, `🚘 <b>یادآور نگهداری و مدارک پژو ۲۰۶</b>\nکارکرد فعلی: ${currentOdo === null ? 'ثبت نشده' : `${formatNum(currentOdo)} km`}\n\n${allAlertLines.join('\n\n')}\n\nاین پیام فقط هنگام ورود به یک مرحلهٔ جدید (نزدیک موعد، موعد رسیده، عقب‌افتاده یا بحرانی) ارسال می‌شود؛ هشدار یک مرحله در هر چرخه تکرار نمی‌شود.\n\nجزئیات: /due · سرویس‌های باز: /issues`, false);
  }
  return { sent: alertLines.length + documentAlerts.lines.length, maintenanceSent: alertLines.length, documentSent: documentAlerts.lines.length, checked: due.length, time: now.iso, currentOdometerKm: currentOdo, stages: (alertLines.length + documentAlerts.lines.length) ? 'transition-notifications' : 'no-stage-transition' };
}

function isPrivateDocumentsAuthorized(request, env) {
  const expected = String(env.DOCUMENTS_ACCESS_TOKEN || "");
  const authorization = String(request.headers.get("Authorization") || "");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  return expected.length >= 1 && constantTimeEqual(token, expected);
}
function normalizeJalaliInput(value) {
  const raw = normalizeDigits(String(value || "").trim()).replace(/-/g, "/").replace(/\s+/g, "");
  const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return match ? `${match[1]}/${match[2].padStart(2,"0")}/${match[3].padStart(2,"0")}` : raw;
}
function isValidJalaliDate(value) {
  const m = String(value || "").match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const year=Number(m[1]), month=Number(m[2]), day=Number(m[3]);
  if (year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1) return false;
  const start = jalaliToGregorian(year, month, 1);
  const next = month === 12 ? jalaliToGregorian(year + 1, 1, 1) : jalaliToGregorian(year, month + 1, 1);
  const maxDay = Math.round((Date.UTC(next[0],next[1]-1,next[2])-Date.UTC(start[0],start[1]-1,start[2]))/86400000);
  return day <= maxDay;
}
function cleanPrivateField(value, maxLength=120) { return String(value || "").replace(/[<>\u0000-\u001f]/g, " ").trim().slice(0,maxLength); }
async function loadPrivateVehicleDocuments(env) {
  if (!env.GARAGE_PRIVATE_KV) throw new Error("GARAGE_PRIVATE_KV binding is not configured.");
  const stored = await env.GARAGE_PRIVATE_KV.get(PRIVATE_VEHICLE_DOCS_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.vehicle || !parsed.plate) throw new Error("Private vehicle documents in KV have an invalid schema.");
    return parsed;
  }
  const seed = String(env.VEHICLE_DOCUMENTS_JSON || "").trim();
  if (!seed) throw new Error("Private vehicle documents are not initialized; set VEHICLE_DOCUMENTS_JSON once.");
  const parsed = JSON.parse(seed);
  if (!parsed || parsed.schemaVersion !== 1 || !parsed.vehicle || !parsed.plate) throw new Error("VEHICLE_DOCUMENTS_JSON has an invalid schema.");
  parsed.updatedAt = parsed.updatedAt || nowTehran().iso;
  await env.GARAGE_PRIVATE_KV.put(PRIVATE_VEHICLE_DOCS_KEY, JSON.stringify(parsed));
  return parsed;
}
async function savePrivateVehicleDocuments(env, documents) {
  if (!env.GARAGE_PRIVATE_KV) throw new Error("GARAGE_PRIVATE_KV binding is not configured.");
  await env.GARAGE_PRIVATE_KV.put(PRIVATE_VEHICLE_DOCS_KEY, JSON.stringify(documents));
}
function normalizePrivatePlate(plate = {}) {
  const normalizeDigitsLocal = value => normalizeDigits(String(value ?? ""));
  const sources = [plate.displayFull, plate.display, plate.number, plate.plateNumber].filter(Boolean).join(" ");
  const source = normalizeDigitsLocal(sources).replace(/[يى]/g, "ی").replace(/ك/g, "ک");
  let match = source.match(/(\d{2})\s*[^\d\s]\s*(\d{3})/u);
  if (!match) {
    const reverse = source.match(/(\d{3})\s*[یيىسصالفبجچحخدذرزژشغفقکگلمنوهءئؤۀة]\s*(\d{2})/u);
    if (reverse) match = [reverse[0], reverse[2], reverse[1]];
  }
  const left = normalizeDigitsLocal(plate.leftDigits || match?.[1] || "68").replace(/\D/g, "").slice(0, 2) || "68";
  const middle = normalizeDigitsLocal(plate.middleDigits || match?.[2] || "127").replace(/\D/g, "").slice(0, 3) || "127";
  const regionMatch = source.match(/(?:ایران|iran)\s*[:：-]?\s*(\d{2})/i);
  const region = normalizeDigitsLocal(plate.regionalCode || regionMatch?.[1] || "63").replace(/\D/g, "").slice(0, 2) || "63";
  const faDigitsLocal = value => String(value).replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  const leftFa = faDigitsLocal(left), middleFa = faDigitsLocal(middle), regionFa = faDigitsLocal(region);
  return {
    leftDigits: leftFa,
    middleDigits: middleFa,
    letter: "ی",
    regionalCode: regionFa,
    display: `${leftFa} ی ${middleFa}`,
    displayFull: `${leftFa} ی ${middleFa} · ایران ${regionFa}`
  };
}

function formatPrivateDocumentsReport(documents) {
  const v=documents.vehicle||{}, p=normalizePrivatePlate(documents.plate||{}), r=documents.registration||{}, l=documents.driverLicense||{}, t=documents.technicalInspection||{}, i=documents.insurance||{};
  const safe=(value)=>String(value ?? "ثبت نشده").replace(/[\u0000-\u001f]/g, " ").trim() || "ثبت نشده";
  const lines = [
    "▣ گاوصندوق خصوصی مدارک پژو ۲۰۶",
    `🚘 پلاک: ${safe(p.displayFull)}`,
    `🚗 خودرو: ${safe(v.make)} ${safe(v.model)} · مدل ${safe(v.modelYearJalali)} · ${safe(v.color)}`,
    `👤 مالک کارت: ${safe(r.ownerName)} · کد ملی ${safe(r.ownerNationalId)}`,
    `🔧 شماره موتور: ${safe(r.engineNumber)}`,
    `🔩 شماره شاسی: ${safe(r.chassisNumber)}`,
    `🧬 VIN: ${safe(r.vin)}`,
    "",
    "🪪 گواهینامه رانندگی",
    `دارنده: ${safe(l.holderName)} · کد ملی ${safe(l.nationalId)}`,
    `شماره گواهینامه: ${safe(l.licenseNumber)} · سریال ${safe(l.cardSerial)}`,
    `تولد: ${safe(l.birthDateJalali)} · صدور: ${safe(l.issueDateJalali)}`,
    `اعتبار: ${safe(l.validityYears)} سال · انقضا: ${safe(l.expiryDateJalali)}${l.expiryDerived ? " (محاسبه‌شده)" : ""}`,
    ...(Array.isArray(l.categories) && l.categories.length ? ["دسته‌های درج‌شده در پشت کارت:", ...l.categories.map(item => `• ${safe(item.type)} · ${safe(item.status)} · اولین صدور: ${safe(item.firstIssueDateJalali)}`)] : []),
    "",
    "🛠 معاینه فنی",
    `شماره گواهی: ${safe(t.certificateNumber)} · مرکز: ${safe(t.center)}`,
    `صدور: ${safe(t.issueDateJalali)} · اعتبار تا: ${safe(t.expiryDateJalali)} · ساعت: ${safe(t.testTime)}`,
    `تعداد مراجعه: ${safe(t.visitCount)} · سوخت: ${safe(t.fuel)} · مدل: ${safe(t.inspectionModel)}`,
    ...(t.plateAtInspection ? [`پلاک درج‌شده هنگام معاینه: ${safe(t.plateAtInspection)}`, `⚠️ ${safe(t.plateAtInspectionNote || "پلاک برگهٔ معاینه را با پلاک فعلی کارت خودرو یکسان فرض نکن.")}`] : []),
    "",
    "🛡 بیمه خودرو",
    i?.expiryDateJalali ? `شرکت: ${safe(i.provider)} · بیمه‌گذار: ${safe(i.insuredName)} · شماره: ${safe(i.policyNumber)} · صدور: ${safe(i.issueDateJalali)} · انقضا: ${safe(i.expiryDateJalali)}` : "اطلاعات بیمه‌نامه هنوز ثبت نشده است؛ تصویر بیمه در آرشیو فعلی پیدا نشد."
  ];
  return lines.join("\n");
}
function escapeSvg(value) {
  return String(value ?? "ثبت نشده").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").slice(0, 180);
}
function svgText(x, y, value, size=27, color="#eaf3ff", weight=500, anchor="end") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" direction="rtl" unicode-bidi="plaintext" font-family="Vazirmatn, Noto Sans Arabic, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeSvg(value)}</text>`;
}
function buildPrivateDocumentsSvg(documents) {
  const v=documents.vehicle||{}, p=normalizePrivatePlate(documents.plate||{}), r=documents.registration||{}, l=documents.driverLicense||{}, t=documents.technicalInspection||{}, i=documents.insurance||{};
  const cards=[]; let y=570;
  const addCard=(title, rows)=>{
    cards.push(`<rect x="70" y="${y}" width="1060" height="${120+Math.ceil(rows.length/2)*78}" rx="26" fill="#111f31" stroke="#30465f" stroke-width="2"/>`);
    cards.push(svgText(1080,y+48,title,27,"#72e7d3",800));
    rows.forEach((row,index)=>{
      const col=index%2, line=Math.floor(index/2), x=col===0?1080:560, yy=y+94+line*78;
      cards.push(svgText(x,yy,row[0],18,"#8faac4",500));
      cards.push(svgText(x,yy+32,row[1]||"ثبت نشده",23,"#f2f7ff",700));
    });
    y += 120+Math.ceil(rows.length/2)*78+20;
  };
  addCard("مشخصات خودرو و مالک",[
    ["خودرو",`${v.make||"Peugeot"} ${v.model||"206 SD"} · ${v.modelYearJalali||"—"}`],
    ["رنگ / سوخت",`${v.color||"—"} · ${v.fuel||"—"}`],
    ["مالک کارت",r.ownerName],
    ["شماره ملی مالک",r.ownerNationalId],
    ["شماره موتور",r.engineNumber],
    ["شماره شاسی",r.chassisNumber],
    ["VIN",r.vin],
    ["سریال کارت",r.cardSerial]
  ]);
  addCard("گواهینامه رانندگی",[
    ["دارنده",l.holderName],
    ["شماره گواهینامه",l.licenseNumber],
    ["شماره ملی",l.nationalId],
    ["تاریخ تولد",l.birthDateJalali],
    ["صدور",l.issueDateJalali],
    ["انقضا",l.expiryDateJalali]
  ]);
  addCard("معاینه فنی",[
    ["شماره گواهی",t.certificateNumber],
    ["مرکز",t.center],
    ["تاریخ صدور",t.issueDateJalali],
    ["اعتبار تا",t.expiryDateJalali],
    ["ساعت / مراجعه",`${t.testTime||"—"} · ${t.visitCount||"—"}`],
    ["مدل درج‌شده",t.inspectionModel]
  ]);
  addCard("بیمه شخص ثالث",[
    ["شرکت بیمه",i.provider||"ثبت نشده"],
    ["شماره بیمه‌نامه",i.policyNumber||"ثبت نشده"],
    ["تاریخ صدور",i.issueDateJalali||"ثبت نشده"],
    ["تاریخ انقضا",i.expiryDateJalali||"ثبت نشده"]
  ]);
  const height=y+35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071321"/><stop offset=".55" stop-color="#10243a"/><stop offset="1" stop-color="#101a2c"/></linearGradient><linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#e6edf0"/></linearGradient><linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1873b9"/><stop offset="1" stop-color="#083a70"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".38"/></filter></defs>
  <rect width="1200" height="${height}" fill="url(#bg)"/><circle cx="1030" cy="80" r="300" fill="#36d8c0" opacity=".05"/><circle cx="90" cy="430" r="260" fill="#58aaff" opacity=".06"/>
  ${svgText(1100,75,"PEUGEOT 206 GARAGE",22,"#72e7d3",800)}${svgText(1100,130,"گاوصندوق خصوصی مدارک خودرو",44,"#f5f9ff",900)}${svgText(1100,175,"نسخه تصویری · فقط برای حساب مجاز",21,"#94abc2",500)}
  <g filter="url(#shadow)"><rect x="85" y="220" width="1030" height="285" rx="24" fill="url(#plate)" stroke="#b8c3ca" stroke-width="9"/><rect x="100" y="235" width="102" height="255" rx="8" fill="url(#blue)"/><path d="M151 275 l-19 7 v20 c0 17 12 27 19 31 7-4 19-14 19-31 v-20z" fill="#fff" opacity=".95"/><path d="M151 279 l-15 6 v16 c0 13 9 22 15 26 6-4 15-13 15-26 v-16z" fill="#e53e52"/><path d="M136 285 h30 v7 h-30z" fill="#fff"/><text x="151" y="375" text-anchor="middle" fill="#fff" font-family="Arial" font-size="22" font-weight="800">IR</text><text x="151" y="405" text-anchor="middle" fill="#fff" font-family="Arial" font-size="15" font-weight="700">IRAN</text>
  <text x="285" y="395" text-anchor="middle" direction="ltr" font-family="Arial" font-size="100" font-weight="900" fill="#101820">${escapeSvg(p.leftDigits)}</text><text x="455" y="395" text-anchor="middle" font-family="Arial, sans-serif" font-size="94" font-weight="900" fill="#101820">ی</text><text x="655" y="395" text-anchor="middle" direction="ltr" font-family="Arial" font-size="100" font-weight="900" fill="#101820">${escapeSvg(p.middleDigits)}</text><rect x="850" y="245" width="235" height="235" rx="8" fill="#fff" stroke="#98a5ae" stroke-width="3"/><text x="967" y="315" text-anchor="middle" direction="rtl" font-family="Vazirmatn, Arial" font-size="37" font-weight="800" fill="#141c22">ایران</text><text x="967" y="427" text-anchor="middle" font-family="Arial" font-size="91" font-weight="900" fill="#101820">${escapeSvg(p.regionalCode)}</text><path d="M190 440 H820" stroke="#c8d0d5" stroke-width="2"/></g>
  ${svgText(1090,545,p.displayFull,20,"#eaf3ff",700)}
  ${cards.join("\n")}
  ${svgText(1090,height-20,"این فایل از فضای خصوصی مدارک تولید شده است · 206 GARAGE",17,"#7892aa",500)}
  </svg>`;
}
async function privateDocumentsTelegramReply(env) {
  try {
    const documents = await loadPrivateVehicleDocuments(env);
    const svg = buildPrivateDocumentsSvg(documents);
    return {
      text: formatPrivateDocumentsReport(documents),
      document: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      filename: "peugeot-206-private-documents.svg",
      caption: "🪪 تصویر مدارک پژو ۲۰۶ · فایل برداری با قابلیت بزرگ‌نمایی",
      keyboard: false
    };
  } catch (error) {
    console.error("private documents Telegram report failed", error?.stack || error);
    return { text: `🔐 گاوصندوق مدارک هنوز آماده نیست.\n${escapeTelegramText(safePublicError(error))}\n\nKV Binding: GARAGE_PRIVATE_KV · مقداردهی اولیه: VEHICLE_DOCUMENTS_JSON`, keyboard: false };
  }
}
async function privateDocumentsReport(env) {
  try { return formatPrivateDocumentsReport(await loadPrivateVehicleDocuments(env)); }
  catch (error) { return `🔐 گاوصندوق مدارک هنوز راه‌اندازی نشده است.\n${escapeTelegramText(safePublicError(error))}\n\nپس از تنظیم GARAGE_PRIVATE_KV و VEHICLE_DOCUMENTS_JSON دوباره /documents را بفرست.`; }
}
async function insuranceCommand(raw, env) {
  const args = String(raw || "").trim();
  const dates = args.match(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g) || [];
  if (/^set\b|^ثبت\b/i.test(args)) {
    if (dates.length < 2) return "قالب ثبت بیمه: <code>/insurance set ۱۴۰۵/۰۱/۰۱ ۱۴۰۶/۰۱/۰۱</code>\nتاریخ اول صدور و تاریخ دوم انقضاست. جزئیات کامل‌تر را می‌توانی در تب مدارک داشبورد وارد کنی.";
    const issueDateJalali=normalizeJalaliInput(dates[0]), expiryDateJalali=normalizeJalaliInput(dates[1]);
    if(!isValidJalaliDate(issueDateJalali)||!isValidJalaliDate(expiryDateJalali)) return "❌ تاریخ شمسی معتبر نیست. نمونه: <code>/insurance set ۱۴۰۵/۰۱/۰۱ ۱۴۰۶/۰۱/۰۱</code>";
    const issue=jalaliToGregorian(...issueDateJalali.split("/").map(Number)); const expiry=jalaliToGregorian(...expiryDateJalali.split("/").map(Number));
    if(Date.UTC(expiry[0],expiry[1]-1,expiry[2])<Date.UTC(issue[0],issue[1]-1,issue[2])) return "❌ تاریخ انقضا قبل از تاریخ صدور است.";
    try {
      const documents=await loadPrivateVehicleDocuments(env);
      documents.insurance={...(documents.insurance||{}),status:"configured",policyType:"شخص ثالث",issueDateJalali,expiryDateJalali,updatedAt:nowTehran().iso};
      documents.updatedAt=nowTehran().iso; await savePrivateVehicleDocuments(env,documents);
      return `✅ تاریخ‌های بیمه در فضای خصوصی ذخیره شد.\nصدور: <b>${issueDateJalali}</b>\nانقضا: <b>${expiryDateJalali}</b>\nیادآورهای ۳۰، ۱۴ و ۷ روز مانده فعال شدند.`;
    } catch(error) { return `⚠️ ذخیره بیمه انجام نشد: ${escapeTelegramText(error.message)}`; }
  }
  try {
    const docs=await loadPrivateVehicleDocuments(env), ins=docs.insurance||{};
    if(!ins.expiryDateJalali) return "🛡 اطلاعات بیمه‌نامه هنوز ثبت نشده است. تصویر بیمه در فایل ارسالی نبود.\nبرای ثبت تاریخ‌ها: <code>/insurance set ۱۴۰۵/۰۱/۰۱ ۱۴۰۶/۰۱/۰۱</code>\nیا از تب «مدارک خودرو» در داشبورد استفاده کن.";
    const days=daysUntilJalaliDate(ins.expiryDateJalali,nowTehran().date);
    return `🛡 <b>وضعیت بیمه شخص ثالث</b>\nشرکت: ${escapeTelegramText(ins.provider||"ثبت نشده")}\nشماره: <code>${escapeTelegramText(ins.policyNumber||"ثبت نشده")}</code>\nصدور: <b>${ins.issueDateJalali||"—"}</b>\nانقضا: <b>${ins.expiryDateJalali}</b>\n${days<0?`🔴 ${formatNum(Math.abs(days))} روز از انقضا گذشته`:days===0?"🟠 امروز آخرین روز اعتبار است":`🟢 ${formatNum(days)} روز تا انقضا`}\nیادآوری روزانه از طریق GitHub Actions انجام می‌شود.`;
  } catch(error) { return `⚠️ اطلاعات بیمه در دسترس نیست: ${escapeTelegramText(error.message)}`; }
}
function daysUntilJalaliDate(value, todayGregorian) {
  const date=normalizeJalaliInput(value); if(!isValidJalaliDate(date)) return null;
  const [gy,gm,gd]=jalaliToGregorian(...date.split("/").map(Number));
  const [ty,tm,td]=String(todayGregorian||nowTehran().date).slice(0,10).split("-").map(Number);
  return Math.round((Date.UTC(gy,gm-1,gd)-Date.UTC(ty,tm-1,td))/86400000);
}
async function collectPrivateDocumentExpiryAlerts(env, now) {
  const empty={lines:[]};
  try {
    if(!env.GARAGE_PRIVATE_KV) return empty;
    const docs=await loadPrivateVehicleDocuments(env);
    const raw=await env.GARAGE_PRIVATE_KV.get(PRIVATE_DOC_REMINDER_KEY);
    const state=raw?JSON.parse(raw):{};
    const entries=[
      {key:"insurance",label:"بیمه شخص ثالث",date:docs.insurance?.expiryDateJalali},
      {key:"technicalInspection",label:"معاینه فنی",date:docs.technicalInspection?.expiryDateJalali},
      {key:"driverLicense",label:"گواهینامه رانندگی",date:docs.driverLicense?.expiryDateJalali}
    ];
    const rank={ok:0,month:1,fortnight:2,week:3,today:4,expired:5};
    const lines=[];
    for(const entry of entries){
      if(!entry.date || !isValidJalaliDate(normalizeJalaliInput(entry.date))) continue;
      const days=daysUntilJalaliDate(entry.date,now.date);
      const stage=days<0?"expired":days===0?"today":days<=7?"week":days<=14?"fortnight":days<=30?"month":"ok";
      const cycle=`${entry.key}:${entry.date}`;
      const previous=state[cycle]||"ok";
      if(rank[stage]>rank[previous] && stage!=="ok"){
        const lead=days<0?`🔴 ${formatNum(Math.abs(days))} روز از تاریخ انقضا گذشته است.`:days===0?"🟠 امروز آخرین روز اعتبار است.":`🟡 ${formatNum(days)} روز تا انقضا باقی مانده است.`;
        lines.push(`🛡 <b>${escapeTelegramText(entry.label)}</b>\n${lead}\nتاریخ انقضا: <code>${escapeTelegramText(entry.date)}</code>\nبرای مشاهده همه مدارک: /documents`);
      }
      state[cycle]=stage;
    }
    // Remove entries belonging to replaced dates so a renewed policy starts a fresh reminder cycle.
    const active=new Set(entries.filter(x=>x.date).map(x=>`${x.key}:${x.date}`));
    for(const key of Object.keys(state)) if(!active.has(key)) delete state[key];
    await env.GARAGE_PRIVATE_KV.put(PRIVATE_DOC_REMINDER_KEY,JSON.stringify(state));
    return {lines};
  } catch(error) {
    console.warn("private document expiry reminder check skipped",error?.stack||error);
    return empty;
  }
}

async function configReport(env) {
  const config = await readConfig(env);
  const rows = Object.entries(config.serviceIntervals || {}).map(([key, value]) => `${value.label || key} [${key}]\n${value.intervalKm ? `${formatNum(value.intervalKm)} km` : "بدون فاصله کیلومتری"}${value.intervalDays ? ` · ${formatNum(value.intervalDays)} روز` : ""}`);
  const ownership = getOwnershipSettings(config);
  return `⚙️ بازه‌های نگهداری قابل ویرایش\nمدل: ${config.vehicle?.label || "Peugeot 206"}\nکیلومتر خرید: ${formatNum(ownership.purchaseOdometerKm)} km\n\n${rows.join("\n\n")}\n\nتغییر بازه: /interval engine_oil 5000 180\nتغییر کیلومتر خرید: /purchasekm 428000\nنام‌های کوتاه انگلیسی و فارسی پشتیبانی می‌شوند.`;
}

async function summaryReport(text, env) {
  const all = await loadAllEvents(env);
  const now = nowTehran();
  const rangeText = text.replace(/^\/\S+/, "").trim().toLowerCase();
  let label = "ماه جاری";
  let events;
  let matchesPeriod;
  if (/today|day|امروز|روز/.test(rangeText)) {
    matchesPeriod = value => String(value || "").slice(0, 10) === now.date;
    events = all.filter(e => matchesPeriod(e.occurredAt || e.date)); label = "امروز";
  } else if (/week|هفته|7d/.test(rangeText)) {
    const cutoff = Date.now() - 7 * 86400000;
    matchesPeriod = value => { const timestamp = Date.parse(value || ""); return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= Date.now(); };
    events = all.filter(e => matchesPeriod(e.occurredAt || e.date)); label = "۷ روز اخیر";
  } else if (/year|سال/.test(rangeText)) {
    matchesPeriod = value => String(value || "").slice(0, 4) === now.date.slice(0, 4);
    events = all.filter(e => matchesPeriod(e.occurredAt || e.date)); label = "سال جاری میلادی";
  } else if (/all|همه|کل/.test(rangeText)) {
    matchesPeriod = () => true;
    events = all; label = "کل سوابق ثبت‌شده";
  } else {
    matchesPeriod = value => String(value || "").slice(0, 7) === now.date.slice(0, 7);
    events = all.filter(e => matchesPeriod(e.occurredAt || e.date));
  }
  // Spending belongs to the date money was paid, not necessarily the date the fine/issue was first recorded.
  const accountingTime = e => e.type === "fine" && e.paid && e.paidAt
    ? e.paidAt
    : e.type === "issue" && Number(e.repairCostRial) > 0 && e.resolvedAt
      ? e.resolvedAt
      : (e.occurredAt || e.date);
  const cost = all.filter(e => Number(e.costRial) > 0 && (e.type !== "fine" || Boolean(e.paid)) && matchesPeriod(accountingTime(e)))
    .reduce((sum, e) => sum + Math.max(0, Number(e.costRial) || 0), 0);
  const fuelCost = events.filter(e => e.type === "fuel").reduce((sum, e) => sum + Math.max(0, Number(e.costRial) || 0), 0);
  const fuelLiters = events.filter(e => e.type === "fuel").reduce((sum, e) => sum + Math.max(0, Number(e.liters) || 0), 0);
  const distanceEntries = calculateDistanceEntries(all, (await readConfig(env)).ownership);
  const trips = distanceEntries.filter(entry => !entry.estimatedHistorical && events.some(e => String(e.date) === entry.date)).reduce((sum, entry) => sum + entry.distanceKm, 0);
  const fines = events.filter(e => e.type === "fine");
  const totalFine = fines.reduce((sum,e)=>sum+(Number(e.costRial)||0),0);
  const paidFine = fines.filter(e=>e.paid).reduce((sum,e)=>sum+(Number(e.costRial)||0),0);
  const unpaid = fines.filter(e => !e.paid).reduce((sum, e) => sum + (Number(e.costRial) || 0), 0);
  const typeCounts = {};
  events.forEach(e => typeCounts[e.type] = (typeCounts[e.type] || 0) + 1);
  const currentOdo = calculateCurrentOdometer(all);
  const config = await readConfig(env);
  const ownership = getOwnershipSettings(config);
  const lifetimeFromPurchase = currentOdo !== null && currentOdo >= ownership.purchaseOdometerKm ? currentOdo - ownership.purchaseOdometerKm : null;
  return `📊 گزارش ${label}\nرویدادها: ${formatNum(events.length)}\nکارکرد فعلی: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}\nمسافت ثبت‌شده در بازه: ${formatNum(trips)} km\nسوخت‌گیری: ${formatNum(fuelLiters)} لیتر\nهزینه سوخت: ${formatMoneyToman(fuelCost)}\nکل هزینه‌های پرداخت‌شده: ${formatMoneyToman(cost)}\n\n🚦 وضعیت جریمه‌های همین بازه\nمجموع جریمه: ${formatMoneyToman(totalFine)}\nپرداخت‌شده: ${formatMoneyToman(paidFine)}\nپرداخت‌نشده: ${formatMoneyToman(unpaid)} (${formatNum(fines.filter(e=>!e.paid).length)} مورد)\n\n👤 از زمان خرید در کیلومتر ${formatNum(ownership.purchaseOdometerKm)}: ${lifetimeFromPurchase === null ? "—" : `${formatNum(lifetimeFromPurchase)} km طبق آخرین کیلومتر ثبت‌شده`}\nپیمایش واقعی از مبنای خرید: ${lifetimeFromPurchase === null ? "—" : `${formatNum(lifetimeFromPurchase)} km`}. برآورد فرضی در گزارش استفاده نمی‌شود.\n\n` + Object.entries(typeCounts).map(([type, count]) => `${eventTypeLabel(type)}: ${formatNum(count)}`).join("\n") + `\n\nخروجی CSV: /export all · نمودار تصویری: /analysis month`;
}

async function latestReport(env) {
  const events = (await loadAllEvents(env)).slice(-10).reverse();
  if (!events.length) return "هنوز رویدادی ثبت نشده. با /help نمونه‌ها را ببین.";
  return "🧾 آخرین رویدادها\n\n" + events.map(e => `${e.jalaliDate || e.date} ${e.time || ""} · ${eventTypeLabel(e.type)}\n${e.title}\n${(e.description || "").slice(0, 120)}\nID: ${e.id.slice(0, 8)}${e.odometerKm ? ` · ${formatNum(e.odometerKm)} km` : ""}${e.costRial ? ` · ${formatMoneyToman(e.costRial)}` : ""}`).join("\n\n");
}

function normalizeFlexibleDate(value) {
  if (!value) return null;
  const source = normalizeDigits(String(value).trim());
  const match = source.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (!match) return null;
  let year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1700) [year, month, day] = jalaliToGregorian(year, month, day);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > maxDays) return null;
  return `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function extractFineTicketNumber(text) {
  return String(text || "").match(/(?:شماره\s*(?:قبض|جریمه|پیگیری)|شناسه\s*(?:جریمه|قبض)|ticket(?:\s*(?:no|number|id))?)\s*[:=：#]?\s*([\da-zA-Z_-]{4,40})/i)?.[1] || null;
}

function fineTimeline(event, nowDate = nowTehran().date) {
  const ticketDate = normalizeFlexibleDate(event.ticketDate) || normalizeFlexibleDate(event.date) || String(event.occurredAt || "").slice(0,10) || null;
  const appealDate = normalizeFlexibleDate(event.appealDecisionDate);
  const explicitDeadline = normalizeFlexibleDate(event.deadlineDate);
  const deadlineDate = explicitDeadline || (event.appealed && appealDate ? addDaysToDate(appealDate, 20) : (!event.appealed && ticketDate ? addDaysToDate(ticketDate, 60) : null));
  const elapsedDays = ticketDate ? daysBetween(ticketDate, nowDate) : null;
  const daysToDeadline = deadlineDate ? daysBetween(nowDate, deadlineDate) : null;
  let statusLabel = event.paid ? "✅ پرداخت‌شده" : "🔴 پرداخت‌نشده";
  if (!event.paid && daysToDeadline != null) {
    if (daysToDeadline < 0) statusLabel = "⚠️ مهلت ثبت‌شده گذشته";
    else if (daysToDeadline <= 10) statusLabel = "🟠 نزدیک پایان مهلت";
    else statusLabel = "🟡 در مهلت پیگیری";
  } else if (!event.paid && event.appealed && !appealDate && !explicitDeadline) {
    statusLabel = "🟡 در انتظار نتیجه اعتراض";
  }
  const potentialAmountRial = !event.paid && daysToDeadline != null && daysToDeadline < 0 ? (Number(event.costRial) || 0) * 2 : null;
  return { ticketDate, deadlineDate, appealDate, elapsedDays, daysToDeadline, statusLabel, potentialAmountRial };
}

async function fineInfoCommand(raw, env) {
  const all = (await loadAllEvents(env)).filter(e => e.type === "fine").sort((a,b)=>String(b.occurredAt||"").localeCompare(String(a.occurredAt||"")));
  if (!all.length) return "✅ هنوز جریمه‌ای ثبت نشده است.\nبرای ثبت: /fine 500000 تومان سرعت غیرمجاز";
  const id = String(raw || "").trim().split(/\s+/)[0];
  if (id) {
    const target = all.find(e => String(e.id).startsWith(id));
    if (!target) return "جریمه‌ای با این شناسه پیدا نشد. از /fines شناسه را بردار.";
    const t = fineTimeline(target);
    const lines = [`🚦 جزئیات جریمه`, `شناسه: <code>${target.id}</code>`, `شرح: ${target.description || "—"}`, `مبلغ درج‌شده در ثبت: ${formatMoneyToman(target.costRial || 0)}`, `وضعیت: ${t.statusLabel}`, `تاریخ جریمه: ${t.ticketDate || "—"}`, `مدت گذشته از ثبت جریمه: ${t.elapsedDays == null ? "—" : `${formatNum(t.elapsedDays)} روز`}`, `مهلت محاسباتی: ${t.deadlineDate || "مشخص نشده؛ به وضعیت رسمی قبض مراجعه کن"}`];
    if (t.daysToDeadline != null) lines.push(t.daysToDeadline < 0 ? `⏳ مهلت ${formatNum(Math.abs(t.daysToDeadline))} روز پیش گذشته است.` : `⏳ ${formatNum(t.daysToDeadline)} روز تا مهلت محاسباتی باقی مانده است.`);
    if (target.ticketNumber) lines.push(`شماره قبض: <code>${target.ticketNumber}</code>`);
    if (target.paid) lines.push(`تاریخ ثبت پرداخت: ${target.paidAt || "ثبت نشده"}`, `مبلغ پرداختی ثبت‌شده: ${target.paidAmountRial ? formatMoneyToman(target.paidAmountRial) : "از مبلغ جریمه استفاده شده/مشخص نشده"}`, `کد پیگیری: ${target.paymentReference || "ثبت نشده"}`);
    if (t.potentialAmountRial != null) lines.push(`برآورد هشدار (نه مبلغ رسمی): ${formatMoneyToman(t.potentialAmountRial)} در صورت شمول قاعده دوبرابری؛ استعلام رسمی لازم است.`);
    lines.push("برای ثبت پرداخت: /paid " + target.id.slice(0,8) + " date=1405/08/03 amount=... تومان ref=...", "مهلت‌ها و مبلغ نهایی را از وضعیت رسمی قبض/راهور تأیید کن؛ این محاسبه حکم قطعی قانونی نیست.");
    return lines.join("\n");
  }
  const unpaid = all.filter(e=>!e.paid);
  const total = all.reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const unpaidAmount = unpaid.reduce((n,e)=>n+(Number(e.costRial)||0),0);
  return `🚦 دفتر مدیریت جریمه\n\nکل: ${formatNum(all.length)} مورد · ${formatMoneyToman(total)}\nپرداخت‌نشده: ${formatNum(unpaid.length)} مورد · ${formatMoneyToman(unpaidAmount)}\n\n` + all.slice(0,20).map(e=>{const t=fineTimeline(e);return `${t.statusLabel} · ${formatMoneyToman(e.costRial||0)}\n${e.description||"جریمه"}\nتاریخ: ${t.ticketDate||"—"} · ${t.elapsedDays==null?"—":`${formatNum(t.elapsedDays)} روز گذشته`} · ID <code>${String(e.id).slice(0,8)}</code>`;}).join("\n\n") + "\n\nبرای جزئیات یک مورد: /fineinfo شناسه";
}

async function finesReport(env) {
  const events = (await loadAllEvents(env)).filter(e => e.type === "fine").sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  if (!events.length) return "✅ جریمه‌ای ثبت نشده است.\n\nثبت جریمه: /fine 500000 تومان سرعت غیرمجاز";
  const unpaid = events.filter(e => !e.paid);
  const paid = events.filter(e => e.paid);
  const totalRial = events.reduce((sum,e)=>sum+(Number(e.costRial)||0),0);
  const paidRial = paid.reduce((sum,e)=>sum+(Number(e.paidAmountRial ?? e.costRial)||0),0);
  const unpaidRial = unpaid.reduce((sum,e)=>sum+(Number(e.costRial)||0),0);
  const overdue = unpaid.filter(e=>{const t=fineTimeline(e);return t.daysToDeadline != null && t.daysToDeadline < 0;});
  return `🚦 گزارش جامع جریمه‌ها\n\n📋 تعداد کل: ${formatNum(events.length)} مورد\n💰 مجموع مبلغ تمام جریمه‌ها: ${formatMoneyToman(totalRial)}\n✅ مجموع پرداخت‌شده: ${formatMoneyToman(paidRial)} (${formatNum(paid.length)} مورد)\n🔴 بدهی پرداخت‌نشده: ${formatMoneyToman(unpaidRial)} (${formatNum(unpaid.length)} مورد)\n⚠️ مهلت محاسباتی گذشته: ${formatNum(overdue.length)} مورد\n\n🧾 آخرین سوابق\n` + events.slice(0,25).map(e=>{const t=fineTimeline(e);return `${t.statusLabel} · ${formatMoneyToman(e.costRial||0)}\n${e.description||"جریمه"}\nتاریخ: ${t.ticketDate||e.date||"—"} · ${t.elapsedDays==null?"—":`${formatNum(t.elapsedDays)} روز گذشته`} · ID <code>${e.id.slice(0,8)}</code>`;}).join("\n\n") + "\n\nجزئیات یک مورد: /fineinfo شناسه\nثبت پرداخت: /paid شناسه date=1405/08/03 amount=... تومان ref=...\n⚠️ مهلت‌های محاسبه‌شده یادآوری هستند؛ مبلغ قطعی را از سامانه رسمی بررسی کن.";
}

async function markFinePaid(input, env) {
  const raw = String(input || "").trim();
  const id = raw.split(/\s+/)[0].replace(/[^a-zA-Z0-9-]/g, "");
  const events = await loadAllEvents(env);
  const fines = events.filter(e => e.type === "fine" && !e.paid);
  if (!id) return fines.length ? "شناسه جریمه پرداخت‌شده را بفرست؛ جریمه‌های پرداخت‌نشده:\n" + fines.map(e => `${e.id.slice(0, 8)} · ${formatMoneyToman(e.costRial || 0)} · ${e.description}`).join("\n") : "✅ جریمه پرداخت‌نشده‌ای وجود ندارد.";
  const target = fines.find(e => e.id === id || e.id.startsWith(id));
  if (!target) return "جریمه پرداخت‌نشده‌ای با این شناسه پیدا نشد. برای فهرست: /fines";
  const dateRaw = raw.match(/(?:date|تاریخ)\s*[=:：]?\s*([0-9۰-۹٠-٩]{4}[\/.\-][0-9۰-۹٠-٩]{1,2}[\/.\-][0-9۰-۹٠-٩]{1,2})/i)?.[1];
  const paidDate = normalizeFlexibleDate(dateRaw) || nowTehran().date;
  const amountRaw = raw.match(/(?:amount|مبلغ|پرداختی)\s*[=:：]?\s*([^,;؛|]+)/i)?.[1];
  const paidAmountRial = amountRaw ? extractMoneyRial(`مبلغ ${amountRaw}`) : null;
  const reference = raw.match(/(?:ref|receipt|پیگیری|کد\s*پیگیری|شناسه\s*پرداخت)\s*[=:：#]?\s*([^,;؛|\s]+)/i)?.[1] || null;
  const paymentDate = `${paidDate}T12:00:00+03:30`;
  const month = String(target.date).slice(0, 7);
  await mutateJsonFile(`data/logs/${month}.json`, env, () => ({ month, events: [] }), current => {
    current.events ||= [];
    const item = current.events.find(e => e.id === target.id);
    if (item) {
      item.paid = true; item.status = "paid"; item.paidAt = paymentDate;
      item.paidAmountRial = paidAmountRial ?? Number(item.costRial || 0);
      item.paymentReference = reference;
      item.paymentDate = paidDate;
      item.updatedAt = nowTehran().iso; item.revision = (Number(item.revision) || 1) + 1;
      item.editHistory = [...(item.editHistory || []), { at: nowTehran().iso, by: "telegram", action: "fine_payment", after: { paid: true, paidAt: paymentDate, paidAmountRial: item.paidAmountRial, paymentReference: reference } }].slice(-20);
    }
    current.updatedAt = nowTehran().iso; return current;
  });
  return `✅ پرداخت جریمه ثبت شد\n\nمبلغ درج‌شده در جریمه: ${formatMoneyToman(target.costRial || 0)}\nمبلغ پرداختی ثبت‌شده: ${formatMoneyToman(paidAmountRial ?? target.costRial ?? 0)}\nتاریخ پرداخت: ${jalaliDateLabel(paidDate)}\nکد پیگیری: ${reference || "ثبت نشده"}\nشناسه: <code>${target.id.slice(0,8)}</code>\n\nبرای مشاهده سابقه: /fineinfo ${target.id.slice(0,8)}`;
}
async function recordRepair(raw, occurredAt, env) {
  const events = await loadAllEvents(env);
  const target = events.filter(e => e.type === "issue" && e.status !== "fixed").slice(-1)[0];
  const cost = extractMoneyRial(raw);
  if (target) {
    const month = String(target.date).slice(0, 7);
    await mutateJsonFile(`data/logs/${month}.json`, env, () => ({ month, events: [] }), current => {
      const item = (current.events || []).find(e => e.id === target.id);
      if (item) {
        item.status = "fixed";
        item.resolvedAt = occurredAt.iso;
        if (cost) { item.repairCostRial = cost; item.costRial = cost; }
        item.repairDescription = raw;
      }
      current.updatedAt = nowTehran().iso;
      return current;
    });
    return `✅ خرابی بسته شد: ${target.description}\nشناسه خرابی: ${target.id.slice(0, 8)}${cost ? `\nهزینه تعمیر: ${formatMoneyToman(cost)}` : ""}\nتاریخ رفع: ${jalaliDateLabel(occurredAt.date)} ${occurredAt.time}`;
  }
  return await saveEvent({ type: "repair", title: "ثبت تعمیر", description: raw || "تعمیر انجام شد", costRial: cost, occurredAt, sourceText: raw }, env);
}

function calculateFuelConsumptionHistory(fuelEvents) {
  const fuel = [...(fuelEvents || [])].filter(e => e && e.type === "fuel").sort((a,b) => eventTimestampForReport(a) - eventTimestampForReport(b));
  const full = fuel.filter(e => e.fullTank && e.odometerKm !== null && e.odometerKm !== undefined && e.odometerKm !== "" && Number.isFinite(Number(e.odometerKm)));
  const results = [];
  for (let i = 1; i < full.length; i++) {
    const from = full[i - 1], to = full[i];
    const km = Number(to.odometerKm) - Number(from.odometerKm);
    const fromTime = eventTimestampForReport(from), toTime = eventTimestampForReport(to);
    if (!(km > 0) || km > 5000 || !(toTime > fromTime)) continue;
    // Fuel bought after the first full tank through the next full tank measures the interval.
    const intervalFuel = fuel.filter(e => {
      const time = eventTimestampForReport(e);
      return time > fromTime && time <= toTime;
    });
    const liters = intervalFuel.reduce((n,e) => n + Math.max(0, Number(e.liters) || 0), 0);
    if (!(liters > 0)) continue;
    const costRial = intervalFuel.reduce((n,e) => n + Math.max(0, Number(e.costRial) || 0), 0);
    results.push({ from, to, km, liters, costRial, consumption: liters / km * 100,
      costPerKmToman: costRial > 0 ? costRial / 10 / km : null,
      fromOdometerKm: Number(from.odometerKm), toOdometerKm: Number(to.odometerKm),
      fromDate: from.jalaliDate || from.date || String(from.occurredAt || "").slice(0,10),
      toDate: to.jalaliDate || to.date || String(to.occurredAt || "").slice(0,10) });
  }
  return results;
}

async function fuelReport(env) {
  const events = await loadAllEvents(env);
  const now = nowTehran();
  const thisMonth = events.filter(e => e.type === "fuel" && String(e.date || e.occurredAt || "").slice(0, 7) === now.date.slice(0, 7));
  const allFuel = events.filter(e => e.type === "fuel");
  const totalLiters = rows => rows.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalCost = rows => rows.reduce((s, e) => s + (Number(e.costRial) || 0), 0);
  const history = calculateFuelConsumptionHistory(allFuel);
  const measuredKm = history.reduce((n,x)=>n+x.km,0);
  const measuredLiters = history.reduce((n,x)=>n+x.liters,0);
  const weightedConsumption = measuredKm > 0 ? measuredLiters / measuredKm * 100 : null;
  const pricedFuel = allFuel.filter(e => Number(e.costRial) > 0 && Number(e.liters) > 0);
  const averagePrice = totalLiters(pricedFuel) > 0 ? totalCost(pricedFuel) / totalLiters(pricedFuel) : null;
  const latest = history.at(-1);
  const segments = history.slice(-6).reverse().map((item,i) => `${i + 1}. ${item.fromDate} ← ${item.toDate}
${formatNum(item.fromOdometerKm)} → ${formatNum(item.toOdometerKm)} km · پیمایش ${formatNum(item.km)} km
سوخت در بازه: ${formatNum(item.liters)} لیتر · مصرف ${formatNum(item.consumption)} لیتر/۱۰۰ km${item.costPerKmToman != null ? ` · هزینه سوخت هر کیلومتر ${formatNum(item.costPerKmToman)} تومان` : ""}`).join("\n\n");
  return `⛽ گزارش کامل سوخت پژو ۲۰۶

📦 ماه جاری: ${formatNum(totalLiters(thisMonth))} لیتر · ${formatMoneyToman(totalCost(thisMonth))}
📊 کل سوخت ثبت‌شده: ${formatNum(totalLiters(allFuel))} لیتر · ${formatMoneyToman(totalCost(allFuel))}
🧾 سوخت‌گیری: ${formatNum(allFuel.length)} بار · باک کامل: ${formatNum(allFuel.filter(e=>e.fullTank).length)} بار
💰 میانگین قیمت هر لیترِ دارای مبلغ: ${averagePrice == null ? "—" : formatMoneyToman(averagePrice)}

📈 مصرف واقعی بر پایهٔ باک کامل
${latest ? `آخرین بازه: ${formatNum(latest.consumption)} لیتر در ۱۰۰ کیلومتر
${formatNum(latest.fromOdometerKm)} → ${formatNum(latest.toOdometerKm)} km · ${formatNum(latest.km)} km پیمایش · ${formatNum(latest.liters)} لیتر سوخت` : "برای شروع اندازه‌گیری، دو سوخت‌گیری با باک کامل و کیلومتر معتبر ثبت کن."}
${weightedConsumption == null ? "میانگین وزنی کل: هنوز بازهٔ معتبر کافی نیست." : `میانگین وزنی کل بازه‌های معتبر: ${formatNum(weightedConsumption)} لیتر/۱۰۰ km
مبنای محاسبه: ${formatNum(measuredKm)} km و ${formatNum(measuredLiters)} لیتر سوخت در بازه‌های کامل.`}

${segments ? `🗓️ جزئیات بازه‌های اخیر
${segments}` : "هنوز بازهٔ مصرف باک‌کامل قابل محاسبه‌ای وجود ندارد."}

ℹ️ فرمول: مجموع لیترهای پس از یک باک کامل تا باک کامل بعدی ÷ اختلاف کیلومترشمار × ۱۰۰. سوخت‌گیری‌های نیمه بین این دو نقطه هم در مجموع لیترها منظور می‌شوند. برای نتیجهٔ دقیق، در هر دو نقطه باک را کامل کن و کیلومتر را ثبت کن.`;
}

function detectServiceKeys(text, config) {
  const lower = normalizeIntentText(text);
  const candidates = [];
  const addAliases = (key, aliases, prefix = "", rank = 0) => {
    for (const aliasValue of aliases || []) {
      const alias = normalizeIntentText(aliasValue);
      if (!alias || alias.length < 2) continue;
      let from = 0;
      while ((from = lower.indexOf(alias, from)) >= 0) {
        candidates.push({ key: `${prefix}${key}`, start: from, end: from + alias.length, length: alias.length, rank });
        from += Math.max(1, alias.length);
      }
    }
  };
  const catalog = config.partCatalog || {};
  for (const [key, item] of Object.entries(catalog.items || {})) {
    addAliases(key, [key.replace(/_/g," "), item.label, ...(item.aliases || [])], "", 3);
  }
  for (const [key, item] of Object.entries(catalog.services || {})) {
    addAliases(key, [key.replace(/_/g," "), item.label, ...(item.aliases || [])], "serviceCatalog:", 4);
  }
  for (const [key, aliases] of Object.entries(SERVICE_ALIASES)) {
    if (!config.serviceIntervals?.[key] && !catalog.items?.[key]) continue;
    addAliases(key, aliases, "", 1);
  }
  candidates.sort((a,b) => a.start - b.start || b.length - a.length || b.rank - a.rank);
  const accepted = [];
  for (const candidate of candidates) {
    const overlaps = accepted.some(existing => candidate.start < existing.end && candidate.end > existing.start);
    if (!overlaps) accepted.push(candidate);
  }
  const keys = [];
  for (const item of accepted.sort((a,b) => a.start - b.start)) if (!keys.includes(item.key)) keys.push(item.key);
  return keys;
}
function detectServiceKey(text, config) {
  return detectServiceKeys(text, config)[0] || null;
}

async function readConfig(env) {
  return await readJsonFile(FILE_CONFIG, env, { serviceIntervals: {}, vehicle: { label: "Peugeot 206" }, ownership: { purchaseOdometerKm: DEFAULT_PURCHASE_ODOMETER_KM } });
}
async function getMonth(month, env) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { month, events: [] };
  return await readJsonFile(`data/logs/${month}.json`, env, { month, events: [] });
}

async function readJsonFile(path, env, fallback) {
  const file = await githubGetFile(path, env);
  if (!file) return structuredClone(fallback);
  try { return JSON.parse(file.content); }
  catch (error) { console.error(`invalid JSON in ${path}`, error); return structuredClone(fallback); }
}

async function mutateJsonFile(path, env, fallbackFactory, mutator) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    const file = await githubGetFile(path, env);
    let value;
    try { value = file ? JSON.parse(file.content) : fallbackFactory(); }
    catch { throw new Error(`Invalid JSON in GitHub file: ${path}`); }
    const next = await mutator(value);
    const body = {
      message: `garage: update ${path}`,
      content: utf8ToBase64(JSON.stringify(next, null, 2) + "\n"),
      branch: env.GITHUB_BRANCH || "main",
      committer: { name: "206 Garage Bot", email: "206-garage-bot@users.noreply.github.com" },
      author: { name: "206 Garage Bot", email: "206-garage-bot@users.noreply.github.com" }
    };
    if (file?.sha) body.sha = file.sha;
    const response = await fetch(githubContentsUrl(path, env), {
      method: "PUT",
      headers: githubHeaders(env),
      body: JSON.stringify(body)
    });
    if (response.ok) return next;
    const errorText = await response.text();
    lastError = new Error(`GitHub write failed ${response.status} for ${path}: ${errorText.slice(0, 400)}`);
    if (response.status === 409 || response.status === 422) {
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 250));
      continue;
    }
    throw lastError;
  }
  throw lastError || new Error(`GitHub write conflict after retries: ${path}`);
}

async function githubGetFile(path, env) {
  const response = await fetch(`${githubContentsUrl(path, env)}?ref=${encodeURIComponent(env.GITHUB_BRANCH || "main")}`, { headers: githubHeaders(env), cf: { cacheTtl: 0, cacheEverything: false } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed ${response.status} for ${path}: ${(await response.text()).slice(0, 350)}`);
  const data = await response.json();
  if (!data.content) return null;
  return { sha: data.sha, content: base64ToUtf8(data.content) };
}

function githubContentsUrl(path, env) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  if (!owner || !repo || owner === "YOUR_GITHUB_USERNAME") throw new Error("Set GITHUB_OWNER and GITHUB_REPO in worker/wrangler.toml first.");
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}
function githubHeaders(env) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN secret is missing.");
  return { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": API_VERSION, "User-Agent": "peugeot-206-garage-worker", "Content-Type": "application/json" };
}
function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function base64ToUtf8(text) {
  const binary = atob(text.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sendText(env, chatId, text, keyboard = false) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN secret is missing.");
  const rawText = String(text || "");
  const boundedText = rawText.length > 3300 ? `${rawText.slice(0, 3150)}\n… ادامه برای جلوگیری از محدودیت طول پیام کوتاه شد.` : rawText;
  const withNavigation = boundedText.includes(SITE_URL) && boundedText.includes(BOT_URL) ? boundedText : `${boundedText}\n\n🌐 داشبورد: ${SITE_URL}\n🤖 ربات: ${BOT_URL}`;
  const body = { chat_id: chatId, text: telegramHtml(withNavigation), parse_mode: "HTML", disable_web_page_preview: true };
  if (keyboard && typeof keyboard === "object") body.reply_markup = keyboard;
  else if (keyboard) body.reply_markup = { keyboard: [[{ text: "/km" }, { text: "/summary" }, { text: "/due" }], [{ text: "/fuelstats" }, { text: "/fines" }, { text: "/operations" }, { text: "/export all" }], [{ text: "/backup" }]], resize_keyboard: true, is_persistent: true };
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function sendDocument(env, chatId, filename, blob, caption) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  const captionText = String(caption || "");
  const captionWithLinks = captionText.includes(SITE_URL) && captionText.includes(BOT_URL) ? captionText : `${captionText}\n🌐 ${SITE_URL}\n🤖 ${BOT_URL}`;
  form.set("caption", telegramHtml(captionWithLinks).slice(0, 1000));
  form.set("parse_mode", "HTML");
  form.set("document", blob, filename);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(`Telegram sendDocument failed: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function sendPhoto(env, chatId, filename, blob, caption) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN secret is missing.");
  const form = new FormData();
  form.set("chat_id", String(chatId));
  const rawCaption = String(caption || "");
  const withNavigation = `${rawCaption}\n\n🌐 داشبورد: ${SITE_URL}\n🤖 ربات: ${BOT_URL}`;
  form.set("caption", telegramHtml(withNavigation).slice(0, 1024));
  form.set("parse_mode", "HTML");
  form.set("photo", blob, filename || "206-garage-chart.png");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(`Telegram sendPhoto failed: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

function eventsToCsv(events) {
  const headers = ["id", "type", "title", "description", "actor", "note", "occurredAt", "jalaliDate", "date", "time", "odometerKm", "previousOdometerKm", "deltaSincePreviousKm", "distanceKm", "liters", "costRial", "serviceKey", "serviceCatalogKey", "serviceLabel", "componentKey", "componentName", "componentCategory", "componentMode", "componentReplaced", "brand", "model", "partNumber", "specs", "quantity", "expenseCategory", "repairGroupId", "paid", "ticketDate", "deadlineDate", "appealed", "appealDecisionDate", "ticketNumber", "fineLocation", "officialCurrentAmountRial", "paidAmountRial", "paidAt", "paymentDate", "paymentReference", "status", "repairDescription", "repairCostRial", "resolvedAt", "fullTank", "updatedAt", "revision"];
  const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...events.map(event => headers.map(key => quote(event[key])).join(","))].join("\r\n");
}

function extractMoneyRial(text) {
  const source = normalizeDigits(String(text || ""));
  const patterns = [
    /(?:هزینه|مبلغ|قیمت|جریمه|پرداخت|cost|price|fine|amount|مجموع|قیمتش)\s*(?:[:=]|حدود|مبلغ)?\s*([\d][\d,._]*)(?:\s*(هزار|میلیون|ملیون|میليون|k|m))?\s*(تومان|تومن|ریال|rial|toman|tomans)?/i,
    /([\d][\d,._]*)\s*(هزار|میلیون|ملیون|میليون|k|m)?\s*(تومان|تومن|ریال|rial|toman|tomans)/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    let amount = parseNumericToken(match[1]);
    if (!Number.isFinite(amount)) continue;
    const multiplier = /میلیون|ملیون|میليون|^m$/i.test(match[2] || "") ? 1000000 : /هزار|^k$/i.test(match[2] || "") ? 1000 : 1;
    amount *= multiplier;
    const unit = (match[3] || "تومان").toLowerCase();
    if (/ریال|rial/.test(unit)) return Math.round(amount);
    return Math.round(amount * 10);
  }
  return null;
}
function parseLiters(text) {
  const source = normalizeDigits(String(text || "").toLowerCase());
  const patterns = [/(\d+(?:\.\d+)?)\s*(?:لیتر|لیتره|لیتر بنزین|liters?|litres?|l)(?![a-z])/i, /(?:بنزین|سوخت.?گیری)\s*(\d+(?:\.\d+)?)/i];
  for (const p of patterns) {
    const m = source.match(p);
    if (m) { const value = Number(m[1]); if (Number.isFinite(value)) return value; }
  }
  return null;
}
function extractOdometer(text) {
  const source = normalizeDigits(String(text || "").toLowerCase());
  const labeled = source.match(/(?:کیلومتر(?:شمار)?|کارکرد(?:\s*ماشین)?|odometer|\bodo\b|\bkm\s*[=:])\s*(?:ماشین\s*)?(?:شده\s*)?(?:روی\s*)?[:=]?\s*([\d][\d,._]*)/i);
  if (labeled) { const n = parseOdometerToken(labeled[1]); if (n >= 1000) return Math.round(n); }
  const explicit = source.match(/([\d][\d,._]*)\s*(?:km|کیلومتر)(?!\s*(?:در|بر|مصرف))/i);
  if (explicit) { const n = parseOdometerToken(explicit[1]); if (n >= 1000) return Math.round(n); }
  return inferOdometerFromContext(source);
}
function inferOdometerFromContext(source) {
  if (!/(برگشتم|رسیدم|ماشین\s*شده|کارکرد\s*ماشین|کیلومتر\s*ماشین)/i.test(source)) return null;
  const cleaned = source
    .replace(/(?:هزینه|مبلغ|قیمت|جریمه|پرداخت|cost|price|fine|amount)\s*(?:[:=])?\s*[\d][\d,._]*(?:\s*(?:هزار|میلیون))?(?:\s*(?:تومان|تومن|ریال|rial|toman))?/gi, ' ')
    .replace(/[\d][\d,._]*\s*(?:هزار|میلیون)\s*(?:تومان|تومن|ریال)?/gi, ' ');
  const candidates = [...cleaned.matchAll(/(?:^|\D)(\d{5,6})(?!\d)/g)].map(match => Number(match[1])).filter(value => value >= 10000 && value < 1000000);
  return candidates.length ? candidates[candidates.length - 1] : null;
}
function extractDistance(text) {
  const source = normalizeDigits(String(text || "").toLowerCase());
  const regex = /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:km|کیلومتر)(?:\s*(?:رفتم|رانندگی|طی|راه|کار کردم|کارکرد))?/ig;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const value = Number(match[1]);
    if (value > 0 && value < 3000) return value;
  }
  const phrase = source.match(/(?:مسافت|طی کردم|رانندگی کردم|کار کردم|drive|drove|trip)\D{0,30}(\d+(?:\.\d+)?)/i);
  if (phrase) { const n = Number(phrase[1]); if (n > 0 && n < 3000) return n; }
  return null;
}
function parseNumericToken(token) {
  const raw = String(token || "").trim();
  if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ""));
  return Number(raw.replace(/[,_]/g, ""));
}
function parseOdometerToken(token) {
  // Odometer readings are integer kilometres; comma, dot or underscore may be thousands separators.
  return Number(String(token || "").replace(/[,. _]/g, ""));
}
function parseFirstNumber(text) {
  const m = normalizeDigits(String(text || "")).match(/\d[\d,]*(?:\.\d+)?/);
  return m ? parseNumericToken(m[0]) : null;
}
function normalizeDigits(value) {
  return String(value).replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬،]/g, ",").replace(/٫/g, ".");
}

function getOccurredAt(text, telegramDate) {
  const source = normalizeDigits(String(text || ""));
  const current = localParts(telegramDate || new Date());
  let y = Number(current.year), m = Number(current.month), d = Number(current.day);
  const dateMatch = source.match(/(?<!\d)(\d{4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?!\d)/);
  if (dateMatch) {
    let year = Number(dateMatch[1]), month = Number(dateMatch[2]), day = Number(dateMatch[3]);
    if (year < 1700) [y, m, d] = jalaliToGregorian(year, month, day);
    else { y = year; m = month; d = day; }
  } else if (/\bپریروز\b/.test(source)) {
    [y, m, d] = shiftDate(y, m, d, -2);
  } else if (/\bدیروز\b/.test(source)) {
    [y, m, d] = shiftDate(y, m, d, -1);
  } else if (/\bفردا\b/.test(source)) {
    [y, m, d] = shiftDate(y, m, d, 1);
  }
  const timeMatch = source.match(/(?:ساعت\s*)?(\d{1,2})\s*[:٫.]\s*(\d{2})(?:\s*(?:دقیقه)?)?/);
  let hour = Number(current.hour), minute = Number(current.minute);
  if (timeMatch && Number(timeMatch[1]) <= 23 && Number(timeMatch[2]) <= 59) { hour = Number(timeMatch[1]); minute = Number(timeMatch[2]); }
  const date = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return parseOccurredInput({ date, time: hhmm });
}
function parseOccurredInput(value) {
  if (value && typeof value === "object" && value.date && value.time) {
    const date = value.date, time = value.time;
    const epoch = Date.parse(`${date}T${time}:00+03:30`);
    return { date, time, iso: `${date}T${time}:00+03:30`, epoch: Number.isFinite(epoch) ? epoch : Date.now() };
  }
  const date = String(value || "").slice(0, 10) || nowTehran().date;
  const time = String(value || "").slice(11, 16) || nowTehran().time;
  return parseOccurredInput({ date, time });
}
function nowTehran() {
  const p = localParts(new Date());
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}`;
  return { ...p, date, time, iso: `${date}T${time}:00+03:30`, epoch: Date.now() };
}
function localParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
}
function shiftDate(year, month, day, offset) {
  const dt = new Date(Date.UTC(year, month - 1, day + offset));
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}
// Jalali (Persian solar calendar) to Gregorian conversion; supports modern Jalali years.
function jalaliToGregorian(jy, jm, jd) {
  jy = Number(jy); jm = Number(jm); jd = Number(jd);
  let jy2 = jy - 979;
  let days = 365 * jy2 + Math.floor(jy2 / 33) * 8 + Math.floor(((jy2 % 33) + 3) / 4);
  const jDays = [31,31,31,31,31,31,30,30,30,30,30,29];
  for (let i = 0; i < jm - 1; i++) days += jDays[i] || 0;
  days += jd - 1;
  let gDays = days + 79;
  let gy = 1600 + 400 * Math.floor(gDays / 146097);
  gDays %= 146097;
  let leap = true;
  if (gDays >= 36525) {
    gDays--;
    gy += 100 * Math.floor(gDays / 36524);
    gDays %= 36524;
    if (gDays >= 365) gDays++;
    else leap = false;
  }
  gy += 4 * Math.floor(gDays / 1461);
  gDays %= 1461;
  if (gDays >= 366) {
    leap = false;
    gDays--;
    gy += Math.floor(gDays / 365);
    gDays %= 365;
  }
  const gMonthDays = [31, (leap ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 12 && gDays >= gMonthDays[gm]) { gDays -= gMonthDays[gm]; gm++; }
  return [gy, gm + 1, gDays + 1];
}
function jalaliDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date(Date.UTC(y, m - 1, d, 9)));
}
function addDaysToDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}
function extractMonthArgument(text) {
  const m = normalizeDigits(String(text || "")).match(/\b(\d{4}-\d{2})\b/);
  return m ? m[1] : null;
}
function eventTypeLabel(type) {
  return ({ odometer: "کیلومترشمار", trip: "مسافت", fuel: "سوخت‌گیری", service: "سرویس", part: "قطعه", expense: "هزینه", fine: "جریمه", wash: "کارواش", issue: "خرابی", repair: "تعمیر", note: "یادداشت" })[type] || type || "رویداد";
}
function formatNum(value) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(Number(value) || 0);
}
function formatMoneyToman(rial) {
  const toman = (Number(rial) || 0) / 10;
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Math.round(toman))} تومان`;
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
