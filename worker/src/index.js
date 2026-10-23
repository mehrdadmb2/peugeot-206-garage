const API_VERSION = "2022-11-28";
const TZ = "Asia/Tehran";
const FILE_INDEX = "data/index.json";
const FILE_CONFIG = "data/config.json";
const FILE_REMINDERS = "data/reminder-state.json";
const FILE_DELETED_EVENTS = "data/deleted-events.json";
const DEFAULT_PURCHASE_ODOMETER_KM = 428000;
const DEFAULT_ESTIMATED_KM_SINCE_PURCHASE = 2400;
const QUICKCHART_URL = "https://quickchart.io/chart";
const SITE_URL = "https://mehrdadmb2.github.io/peugeot-206-garage/";
const BOT_URL = "https://t.me/Peugeot206GarageBot";

const SERVICE_ALIASES = {
  engine_oil: ["engine_oil", "oil", "روغن موتور", "روغن", "موتور", "engine oil"],
  oil_filter: ["oil_filter", "فیلتر روغن", "فیلترروغن", "oil filter"],
  air_filter: ["air_filter", "فیلتر هوا", "فیلترهوا", "air filter"],
  cabin_filter: ["cabin_filter", "فیلتر کابین", "فیلتر اتاق", "cabin filter"],
  fuel_filter: ["fuel_filter", "فیلتر بنزین", "فیلتر سوخت", "fuel filter"],
  spark_plugs: ["spark_plugs", "شمع", "شمع موتور", "spark plug", "spark plugs"],
  timing_belt: ["timing_belt", "تسمه تایم", "تسمه‌تایم", "timing belt"],
  coolant: ["coolant", "ضدیخ", "ضد یخ", "مایع خنک کننده", "آب رادیاتور", "coolant"],
  brake_fluid: ["brake_fluid", "روغن ترمز", "brake fluid"],
  brake_inspection: ["brake_inspection", "بازدید ترمز", "لنت", "ترمز", "brake inspection"],
  tyre_inspection: ["tyre_inspection", "tire_inspection", "لاستیک", "باد لاستیک", "فشار باد", "tyre"],
  battery_check: ["battery_check", "باتری", "باطری", "battery"]
};

const SERVICE_START_WORDS = ["تعویض", "عوض کردم", "عوض شد", "عوضش کردم", "سرویس کردم", "سرویس شد", "بررسی کردم", "بازدید کردم", "چک کردم", "تعویض کردم"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) return corsResponse(new Response(null, { status: 204 }));

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/api")) {
      return json({
        ok: true,
        service: "206 Garage API",
        version: "3.2.0",
        timezone: TZ,
        mode: "request-driven",
        dashboard: SITE_URL,
        telegram: BOT_URL,
        writes: "GitHub Contents API commits are awaited before a successful response; no Cron/periodic trigger is required.",
        endpoints: {
          health: "GET /health",
          telegramWebhook: "POST /telegram",
          record: "POST /api/v1/record (Authorization: Bearer <API_ACCESS_TOKEN>, JSON {text:'...' } or typed event)",
          overview: "GET /api/v1/overview (authorized)",
          events: "GET /api/v1/events?month=YYYY-MM&type=fuel&limit=100 (authorized)",
          due: "GET /api/v1/due (authorized)",
          config: "GET /api/v1/config (authorized)",
          export: "GET /api/v1/export?month=YYYY-MM or month=all (authorized CSV)",
          purchaseOdometer: "POST /api/v1/record with text /purchasekm 428000 estimate=2400 (authorized)",
          analysis: "Telegram /analysis hour|day|week|month sends PNG charts and a detailed report",
          updateEvent: "POST /api/v1/event/update (authorized JSON {id, patch})",
          deleteEvent: "DELETE /api/v1/event?id=<event-id> (authorized; archived before removal)"
        }
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "206 Garage API", version: "3.2.0", time: nowTehran().iso, timezone: TZ, mode: "request-driven", configured: {
        telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET && env.ALLOWED_TELEGRAM_USER_ID),
        github: Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO),
        externalApi: Boolean(env.API_ACCESS_TOKEN)
      }, scheduler: "not required; no scheduled handler" });
    }
    if (url.pathname === "/telegram" && request.method === "POST") {
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      let update;
      try { update = await request.json(); }
      catch { return new Response("invalid json", { status: 400 }); }
      try {
        await handleTelegramUpdate(update, env);
        return new Response("ok", { status: 200 });
      } catch (error) {
        console.error("telegram update failed", error?.stack || error);
        // Return 200 for an unrecoverable update so Telegram does not create a retry storm.
        return new Response("handled", { status: 200 });
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
    return json({ ok: true, vehicle: config.vehicle || {}, ownership, ownershipDrivenKm, ownershipEstimateDifferenceKm: ownershipDrivenKm === null ? null : ownershipDrivenKm - ownership.estimatedKmSincePurchaseKm, timezone: TZ, updatedAt: index.updatedAt || null, eventCount: events.length, currentOdometerKm: currentOdo, currentMonth, currentMonthEventCount: monthEvents.length, totalCostRial: actualCosts.reduce((n,e)=>n+(Number(e.costRial)||0),0), currentMonthCostRial: actualCosts.filter(e => accountingDateForApi(e).slice(0,7) === currentMonth).reduce((n,e)=>n+(Number(e.costRial)||0),0), currentMonthFuelLiters: monthEvents.filter(e=>e.type === "fuel").reduce((n,e)=>n+(Number(e.liters)||0),0), totalFineCount: fines.length, totalFineRial: fines.reduce((n,e)=>n+(Number(e.costRial)||0),0), paidFineRial, unpaidFineCount: unpaidFines.length, unpaidFineRial: unpaidFines.reduce((n,e)=>n+(Number(e.costRial)||0),0), openIssueCount: openIssues.length, dueItems: due, months: index.months || [] });
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
    const persisted = /✅ ثبت شد:|چند مورد سرویس از پیام تشخیص داده شد و جداگانه ثبت شد|بازه .+ ذخیره شد|پرداخت جریمه ثبت شد|خرابی بسته شد/i.test(replyText);
    if (reply?.document) return json({ ok: false, error: "use_csv_endpoint", message: "برای دریافت CSV از GET /api/v1/export?month=YYYY-MM استفاده کن." }, 400);
    return json({ ok: true, persisted, source: "github", reply: replyText, filename: reply?.filename || null, note: "در رویدادهای تغییردهنده، پاسخ موفق پس از پایان commitهای GitHub ارسال می‌شود؛ گزارش‌ها فقط داده‌های ذخیره‌شده را می‌خوانند." });
  }
  return json({ ok: false, error: "not_found", allowed: ["GET /api/v1/overview","GET /api/v1/events","GET /api/v1/due","GET /api/v1/config","GET /api/v1/export","POST /api/v1/record","POST /api/v1/event/update","DELETE /api/v1/event?id=EVENT_ID"] }, 404);
}

function accountingDateForApi(event) {
  return String(event.type === "fine" && event.paid && event.paidAt ? event.paidAt : event.type === "issue" && event.resolvedAt && Number(event.repairCostRial) > 0 ? event.resolvedAt : event.occurredAt || event.date || "");
}

async function handleTelegramUpdate(update, env) {
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
    const reply = await processMessage(text, message, env);
    if (reply?.document) {
      await sendDocument(env, chatId, reply.filename, reply.document, reply.caption || "خروجی دفتر خودرو");
    } else if (Array.isArray(reply?.photos)) {
      if (reply.text) await sendText(env, chatId, reply.text, false);
      for (const item of reply.photos) await sendPhoto(env, chatId, item.filename, item.blob, item.caption || "نمودار تحلیلی پژو ۲۰۶");
    } else if (Array.isArray(reply?.messages)) {
      for (const item of reply.messages) await sendText(env, chatId, item.text, item.markup || false);
    } else if (reply?.text) {
      const shortId = reply.eventId || eventIdFromReply(reply.text);
      const markup = reply.markup || (shortId ? eventActionKeyboard(shortId) : null);
      await sendText(env, chatId, reply.text, markup || reply.keyboard !== false);
    }
  } catch (error) {
    console.error("message processing failed", error?.stack || error);
    await sendText(env, chatId, "⚠️ عملیات انجام نشد. وضعیت Worker و دسترسی Contents: Read and write را در Cloudflare بررسی کن. جزئیات فنی در Worker Logs ثبت شده است.");
  }
}

async function handleCallbackQuery(query, env) {
  const senderId = String(query?.from?.id ?? "");
  const chatId = query?.message?.chat?.id;
  const callbackId = query?.id;
  if (senderId !== String(env.ALLOWED_TELEGRAM_USER_ID || "")) {
    await answerCallbackQuery(env, callbackId, "این ربات خصوصی است.", true);
    return;
  }
  const match = String(query?.data || "").match(/^evt:([a-f0-9-]{6,36}):(detail|edit|note|actor|delete|confirm|cancel)$/i);
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
  edit: "edit", اصلاح: "edit", ویرایش: "edit",
  annotate: "annotate", comment: "annotate", noteevent: "annotate", توضیح: "annotate",
  actor: "actor", who: "actor", person: "actor", شخص: "actor", انجامدهنده: "actor",
  delete: "delete", remove: "delete", حذف: "delete",
  backup: "backup", exportjson: "backup", پشتیبان: "backup",
  cancel: "cancel", لغو: "cancel",
  restore: "restore", بازگردانی: "restore",
  people: "people", persons: "people", اشخاص: "people", افراد: "people",
  operations: "operations", records: "operations", list: "operations", allrecords: "operations", عملیات: "operations", سوابق: "operations", فهرست: "operations",
  undo: "undo"
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
    .replace(/[ـ]/g, "").replace(/[؛;]/g, " ").replace(/[،]/g, ",")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
function telegramHtml(value) {
  const lines = String(value || "").slice(0, 3800).split("\n");
  let firstContentSeen = false;
  const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  const linkify = html => String(html)
    .replaceAll(SITE_URL, `<a href="${SITE_URL}">باز کردن داشبورد</a>`)
    .replaceAll(BOT_URL, `<a href="${BOT_URL}">گفت‌وگو با ربات</a>`);
  const rendered = lines.map(original => {
    const line = original.trimEnd();
    if (!line.trim()) return "";
    const safe = linkify(escape(line));
    if (!firstContentSeen) { firstContentSeen = true; return `<b>${safe}</b>`; }
    const heading = line.match(/^(?:🧾|👤|📊|⛽|🚦|🧰|🗂|🛡️|📝|✏️|⚙️|🚘|📦|🔎|📖|💳|✅|❌|⚠️)\s+[^:]{2,70}$/u);
    if (heading) return `<b>${safe}</b>`;
    const commandMatch = line.match(/^\s*(\/[a-zA-Z0-9_]+)(?:\s+(.*))?$/);
    if (commandMatch) {
      const commandAndArgs = commandMatch[0].trim();
      const delimiter = commandAndArgs.search(/\s+[—-]\s+/);
      if (delimiter >= 0) {
        const command = commandAndArgs.slice(0, delimiter).trim();
        const description = commandAndArgs.slice(delimiter).replace(/^\s+[—-]\s+/, "");
        return `<code>${escape(command)}</code> — ${escape(description)}`;
      }
      return `<code>${escape(commandAndArgs)}</code>`;
    }
    const fieldLine = line.match(/^([^:：]{1,38})\s*[:：]\s*(.*)$/);
    if (fieldLine) {
      const label = fieldLine[1].trim();
      const fieldValue = fieldLine[2];
      if (/^(?:شناسه|ID|کد|شناسه تلگرام شما|شناسه گفتگو)$/i.test(label)) return `<b>${escape(label)}:</b> <code>${escape(fieldValue)}</code>`;
      if (/^(?:شرح عملیات|توضیح تکمیلی|یادداشت|شرح تعمیر)$/i.test(label)) return `<b>${escape(label)}:</b>\n<blockquote>${escape(fieldValue)}</blockquote>`;
      if (/^(?:کیلومتر ثبت\s*شده|موعد کیلومتری بعدی|کیلومترشمار|مسافت|سوخت|هزینه|مبلغ|کارکرد فعلی|مسافت از آخرین کیلومتر ثبت\s*شده|مسافت از ثبت قبلی)$/i.test(label)) return `<b>${escape(label)}:</b> <code>${escape(fieldValue)}</code>`;
      if (/^(?:دسته|تاریخ|انجام.?دهنده|وضعیت جریمه|وضعیت خرابی|سرویس\/قطعه|زمان ثبت|آخرین ویرایش|رویدادها)$/i.test(label)) return `<b>${escape(label)}:</b> ${escape(fieldValue)}`;
    }
    if (/^(?:⚠️|⛔|💡|📌|نکته[:：])/u.test(line)) return `<blockquote>${safe}</blockquote>`;
    return safe.replace(/`([^`]{1,140})`/g, (_, code) => `<code>${escape(code)}</code>`);
  });
  return rendered.join("\n");
}

async function processMessage(text, message, env) {
  const parsedCommand = canonicalizeCommand(text);
  text = parsedCommand.text;
  if (parsedCommand.unknown) return { text: `دستور «/${parsedCommand.command}» شناخته نشد. راهنمای کامل و نمونه‌های ثبت را پایین ببین:\n\n${helpText()}`, keyboard: true };
  const lower = normalizeIntentText(text);
  const fromDate = new Date((message.date || Math.floor(Date.now() / 1000)) * 1000);
  const deepLinkEvent = text.match(/^\/start(?:@\w+)?\s+e_([a-f0-9-]{6,36})/i);
  if (deepLinkEvent) {
    const event = await findEventByPrefix(deepLinkEvent[1], env);
    return event ? { text: formatEventDetails(event), markup: eventActionKeyboard(event.id.slice(0, 8)) } : { text: "رویداد موردنظر پیدا نشد یا حذف شده است. /latest را بررسی کن.", keyboard: false };
  }
  if (/^\/(start|help)(?:@\w+)?\b/i.test(text)) return { text: helpText(), keyboard: true };
  if (/^\/guide\b|^\/راهنمای_کامل\b|^\/دفترچه\b/i.test(text)) return { messages: await guideMessages(env), keyboard: false };
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
    const value = parseFirstNumber(text.replace(/^\/\S+/, ""));
    if (!(value > 0)) return { text: "کارکرد را این‌طور بفرست: /km 156000 یا /km ۱۵۶۰۰۰", keyboard: false };
    return { text: await saveEvent({ type: "odometer", title: "ثبت کیلومترشمار", description: text, odometerKm: Math.round(value), occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
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
    return { text: await saveEvent({ type: "fine", title: "ثبت جریمه", description: raw, costRial: cost, odometerKm: extractOdometer(raw), paid: false, occurredAt: getOccurredAt(text, fromDate), sourceText: text }, env), keyboard: true };
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
  if (/خراب|صدای|نشتی|لرزش|چکه|چراغ چک|عیب|مشکل|روشن نمی.?شود|داغ کرد|جوش آورد|\bbroken\b|\bnoise\b|\bleak(?:ing)?\b|\bvibration\b|\bcheck engine\b|\bissue\b|\bproblem\b|\boverheat(?:ed|ing)?\b/i.test(lower) && !/درست شد|تعمیر شد|رفع شد|\bfixed\b|\brepaired\b|\bresolved\b/i.test(lower)) {
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
📈 گزارش تصویری با نمودار: /analysis month
گزینه‌های تحلیل: hour · day · week · month

🧭 کیلومتر خرید و برآورد پیمایش
/purchasekm — نمایش مبنا و اختلاف با کیلومتر فعلی
/purchasekm 428000 estimate=2400 — تنظیم کیلومتر خرید و برآورد تقریبی
مبنا ۴۲۸٬۰۰۰ است؛ کیلومتر واقعی فعلی هرگز برای هم‌خوان شدن با برآورد تغییر داده نمی‌شود.

🛠 مدیریت عملیات
/operations — آخرین ۲۰ عملیات با شناسه و دکمه‌ها
/operations all — فهرست کامل عملیات
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
برآورد اعلام‌شده: ${formatNum(ownership.estimatedKmSincePurchaseKm)} km
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
/purchasekm 428000 estimate=2400 — مبنای کیلومتر خرید
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
  const estimatedKmSincePurchaseKm = Number(source.estimatedKmSincePurchaseKm ?? source.estimatedDrivenSincePurchaseKm ?? DEFAULT_ESTIMATED_KM_SINCE_PURCHASE);
  return {
    purchaseOdometerKm: Number.isFinite(purchaseOdometerKm) && purchaseOdometerKm > 0 ? Math.round(purchaseOdometerKm) : DEFAULT_PURCHASE_ODOMETER_KM,
    estimatedKmSincePurchaseKm: Number.isFinite(estimatedKmSincePurchaseKm) && estimatedKmSincePurchaseKm >= 0 ? Math.round(estimatedKmSincePurchaseKm) : DEFAULT_ESTIMATED_KM_SINCE_PURCHASE,
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
    const actual = current !== null && current >= existing.purchaseOdometerKm ? current - existing.purchaseOdometerKm : null;
    const diff = actual === null ? null : actual - existing.estimatedKmSincePurchaseKm;
    return `🚘 مبنای مالکیت پژو ۲۰۶
کیلومتر هنگام خرید: ${formatNum(existing.purchaseOdometerKm)} km
آخرین کیلومتر ثبت‌شده: ${current === null ? "ثبت نشده" : `${formatNum(current)} km`}
پیمایش محاسبه‌شده از خرید: ${actual === null ? "قابل محاسبه نیست؛ کیلومتر فعلی از مبنا کمتر است" : `${formatNum(actual)} km`}
برآورد تقریبی اعلام‌شده: ${formatNum(existing.estimatedKmSincePurchaseKm)} km
اختلاف محاسبه با برآورد: ${diff === null ? "—" : `${diff > 0 ? "+" : ""}${formatNum(diff)} km`}

اگر کیلومتر فعلی ۴۳۱۳۸۱ باشد، از مبنای ۴۲۸۰۰۰ اختلاف ۳۳۸۱ کیلومتر می‌شود؛ این با برآورد ۲۴۰۰ کیلومتر ۹۸۱ کیلومتر اختلاف دارد. برای هم‌خوان شدن اعداد، کیلومتر واقعی روی کیلومترشمار را تأیید کن؛ این دستور کیلومتر واقعی را دست‌کاری نمی‌کند.

تنظیم نمونه: /purchasekm 428000 estimate=2400`;
  }
  const km = parseFirstNumber(raw);
  if (!(km >= 10000 && km < 1000000)) return `نمونه: /purchasekm 428000 estimate=2400\nکیلومتر خرید باید یک مقدار معتبر کیلومترشمار باشد.`;
  const estimateMatch = normalizeDigits(raw).match(/(?:estimate|برآورد|تخمین)\s*[:=]?\s*(\d[\d,._]*)/i);
  const dateMatch = normalizeDigits(raw).match(/(?:date|تاریخ)\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i);
  const saved = await mutateJsonFile(FILE_CONFIG, env, () => ({ schemaVersion: 1, serviceIntervals: {}, people: [] }), current => {
    current.ownership ||= {};
    current.ownership.purchaseOdometerKm = Math.round(km);
    current.ownership.estimatedKmSincePurchaseKm = estimateMatch ? Math.max(0, Math.round(parseNumericToken(estimateMatch[1]))) : existing.estimatedKmSincePurchaseKm;
    current.ownership.purchaseDate = dateMatch ? dateMatch[1] : current.ownership.purchaseDate || null;
    current.ownership.defaultActor = "من";
    current.ownership.updatedAt = nowTehran().iso;
    return current;
  });
  const currentOdo = calculateCurrentOdometer(await loadAllEvents(env));
  const actual = currentOdo !== null && currentOdo >= saved.ownership.purchaseOdometerKm ? currentOdo - saved.ownership.purchaseOdometerKm : null;
  return `✅ مبنای مالکیت ذخیره شد
کیلومتر خرید: ${formatNum(saved.ownership.purchaseOdometerKm)} km
آخرین کیلومتر ثبت‌شده: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}
مسافت محاسبه‌شده: ${actual === null ? "—" : `${formatNum(actual)} km`}
برآورد ذخیره‌شده: ${formatNum(saved.ownership.estimatedKmSincePurchaseKm)} km
تاریخ خرید: ${saved.ownership.purchaseDate || "ثبت نشده؛ بخش تاریخی در تحلیل ساعتی/روزانه پخش نمی‌شود"}

سوابق قبلی بدون نام شخص «من» فرض می‌شوند مگر اینکه قبلاً شخص دیگری ثبت شده باشد.`;
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
  const fines = rangedEvents.filter(e => e.type === "fine");
  const fineTotal = fines.reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const finePaid = fines.filter(e=>e.paid).reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const fineUnpaid = fines.filter(e=>!e.paid).reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const actualCost = expenseEvents.reduce((n,e)=>n+(Number(e.costRial)||0),0);
  const liters = fuelEvents.reduce((n,e)=>n+(Number(e.liters)||0),0);
  const currentOdo = calculateCurrentOdometer(events);
  const ownership = getOwnershipSettings(config);
  const ownershipKm = currentOdo !== null && currentOdo >= ownership.purchaseOdometerKm ? currentOdo - ownership.purchaseOdometerKm : null;
  const discrepancy = ownershipKm === null ? null : ownershipKm - ownership.estimatedKmSincePurchaseKm;
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

👤 از زمان خرید
کیلومتر خرید: ${formatNum(ownership.purchaseOdometerKm)} km
پیمایش بر مبنای کیلومترهای ثبت‌شده: ${ownershipKm === null ? "—" : `${formatNum(ownershipKm)} km`}
برآورد اعلام‌شده: ${formatNum(ownership.estimatedKmSincePurchaseKm)} km
اختلاف دو محاسبه: ${discrepancy === null ? "—" : `${discrepancy > 0 ? "+" : ""}${formatNum(discrepancy)} km`}${discrepancy !== null && Math.abs(discrepancy)>150 ? "\n⚠️ کیلومترهای موجود با برآورد تقریبی تطابق کامل ندارند؛ کیلومتر واقعی را تأیید کن." : ""}

📈 سه نمودار تصویری در پیام‌های بعدی ارسال می‌شوند.`;
  try {
    const labels = buckets.map(b=>b.label);
    const chartSpecs = [
      { filename: "206-garage-costs.png", title: `روند هزینه · ${analysisPeriodLabel(period)}`, seriesLabel: "میلیون تومان", values: costValues, type: "bar", color: "rgba(73,222,236,0.78)", caption: "💳 نمودار هزینه‌های پرداخت‌شده · مقیاس: میلیون تومان" },
      { filename: "206-garage-fuel.png", title: `سوخت‌گیری · ${analysisPeriodLabel(period)}`, seriesLabel: "لیتر", values: fuelValues, type: "line", color: "rgba(255,181,107,0.95)", caption: "⛽ نمودار حجم سوخت‌گیری · واحد: لیتر" },
      { filename: "206-garage-distance.png", title: `مسافت · ${analysisPeriodLabel(period)}`, seriesLabel: "کیلومتر", values: distanceValues, type: "line", color: "rgba(173,148,255,0.95)", caption: "🚗 نمودار مسافت ثبت‌شده · کیلومترهای تاریخی با تاریخ خرید نامشخص در بازه‌های زمانی توزیع نمی‌شوند." }
    ];
    const photos = await Promise.all(chartSpecs.map(async spec => ({
      filename: spec.filename,
      blob: await createChartPng({ labels, values: spec.values, title: spec.title, seriesLabel: spec.seriesLabel, color: spec.color, type: spec.type }),
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
    return "نوع سرویس از پیام تشخیص داده نشد. نمونه: /service oil cost=900000 toman km=156000\nاز /config برای دیدن کلیدها استفاده کن.";
  }
  if (keys.length > 1 && type === "service") {
    const confirmations = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const label = config.serviceIntervals?.[key]?.label || key;
      const saved = await saveEvent({ type: "service", title: `ثبت سرویس: ${label}`, description: rawText, serviceKey: key, serviceLabel: label, odometerKm: odo, costRial: i === 0 ? money : null, occurredAt, sourceText: rawText }, env);
      confirmations.push(`• ${label}: ${saved.split("\n").slice(0, 3).join(" · ")}`);
    }
    return `✅ چند مورد سرویس از پیام تشخیص داده شد و جداگانه ثبت شد:\n${confirmations.join("\n")}\nمبلغ کل فقط یک بار در گزارش هزینه محاسبه شده است.`;
  }
  const key = keys[0] || null;
  const label = key ? config.serviceIntervals?.[key]?.label || key : "قطعه/سرویس متفرقه";
  return await saveEvent({ type: type === "part" ? "part" : "service", title: `${type === "part" ? "ثبت قطعه" : "ثبت سرویس"}: ${label}`, description: rawText, serviceKey: key || null, serviceLabel: label, odometerKm: odo, costRial: money, occurredAt, sourceText: rawText }, env);
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
    fullTank: Boolean(input.fullTank),
    paid: input.type === "fine" ? Boolean(input.paid) : undefined,
    paidAt: null,
    status: input.status || (input.type === "issue" ? "open" : undefined),
    metadata: { source: input.source || "telegram-or-api" }
  };
  if ((event.type === "service" || event.type === "part" || event.type === "fuel" || event.type === "wash" || event.type === "issue" || event.type === "expense" || event.type === "fine") && event.odometerKm === null && latestOdo !== null) {
    event.odometerKm = latestOdo;
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
  if (event.odometerKm !== null) lines.push(`کیلومتر ثبت‌شده: ${formatNum(event.odometerKm)} km`);
  if (event.deltaSincePreviousKm != null) lines.push(`مسافت از آخرین کیلومتر ثبت‌شده: ${formatNum(event.deltaSincePreviousKm)} km · راننده: ${event.distanceActor || event.actor || "من"}`);
  if (event.distanceKm !== null) lines.push(`مسافت: ${formatNum(event.distanceKm)} km${event.odometerAfterKm !== null ? ` · کارکرد تخمینی جدید: ${formatNum(event.odometerAfterKm)} km` : " · برای تخمین کارکرد، ابتدا /km ثبت کن"}`);
  if (event.liters !== null) lines.push(`سوخت: ${formatNum(event.liters)} لیتر`);
  if (event.costRial !== null) lines.push(`هزینه: ${formatMoneyToman(event.costRial)}`);
  if (event.note) lines.push(`توضیح تکمیلی: ${event.note}`);
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
function escapeTelegramText(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  if (event.type === "fine") lines.push(`وضعیت جریمه: ${event.paid ? "✅ پرداخت‌شده" : "🔴 پرداخت‌نشده"}`);
  if (event.type === "issue") lines.push(`وضعیت خرابی: ${event.status === "fixed" ? "✅ رفع‌شده" : "🟠 باز"}`);
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

async function deleteEventByPrefix(prefix, env, deletedBy = "telegram") {
  const match = await getMatchingEvent(prefix, env);
  if (match.error) return { text: match.error, event: null };
  const event = match.event;
  const month = String(event.date || event.occurredAt || "").slice(0, 7);
  const filePath = `data/logs/${month}.json`;
  const deletedAt = nowTehran().iso;
  // Archive first so a write failure cannot destroy the only copy of a record.
  await mutateJsonFile(FILE_DELETED_EVENTS, env, () => ({ schemaVersion: 1, updatedAt: null, events: [] }), current => {
    current.events ||= [];
    if (!current.events.some(item => item.id === event.id)) current.events.push({ ...event, deletedAt, deletedBy, deletionReason: "user-request", archiveVersion: 1 });
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
  if (!due.length) return `✅ مورد فوری برای سرویس ثبت‌شده پیدا نشد.\nکارکرد فعلی: ${currentOdo === null ? "ثبت نشده؛ با /km ثبت کن" : `${formatNum(currentOdo)} km`}\nاین نتیجه فقط بر اساس سرویس‌هایی است که در ربات ثبت کرده‌ای.`;
  return `🧰 وضعیت سرویس‌های پژو ۲۰۶\nکارکرد فعلی: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}\n\n` + due.map(d => `${d.overdue ? "🔴 عقب‌افتاده" : "🟠 نزدیک موعد"} · ${d.label}\n${d.kmText}${d.daysText ? `\n${d.daysText}` : ""}`).join("\n\n") + "\n\nبازه‌ها پیش‌فرض و قابل تنظیم‌اند؛ مشخصات دفترچه/موتور خودت ملاک نهایی است.";
}

function calculateDueItems(events, config, currentOdo, now) {
  const today = now.date;
  const items = [];
  for (const [key, interval] of Object.entries(config.serviceIntervals || {})) {
    const previous = events.filter(e => e.type === "service" && e.serviceKey === key).sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))[0];
    if (!previous) continue;
    const kmInterval = Number(interval.intervalKm) || 0;
    const dayInterval = Number(interval.intervalDays) || 0;
    let remainingKm = null;
    if (kmInterval > 0 && currentOdo !== null && Number.isFinite(previous.odometerKm)) remainingKm = Math.round(previous.odometerKm + kmInterval - currentOdo);
    const nextDate = dayInterval > 0 ? addDaysToDate(previous.date || String(previous.occurredAt).slice(0, 10), dayInterval) : null;
    const remainingDays = nextDate ? daysBetween(today, nextDate) : null;
    const kmNear = remainingKm !== null && remainingKm <= Math.max(500, Math.round(kmInterval * 0.1));
    const dateNear = remainingDays !== null && remainingDays <= 14;
    if (!kmNear && !dateNear) continue;
    items.push({
      key, label: interval.label || key,
      overdue: (remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0),
      remainingKm, remainingDays,
      kmText: remainingKm === null ? "موعد کیلومتری: برای محاسبه، کیلومترشمار و کیلومتر زمان سرویس باید ثبت شده باشد" : remainingKm <= 0 ? `${formatNum(Math.abs(remainingKm))} km از موعد گذشته` : `${formatNum(remainingKm)} km تا موعد`,
      daysText: remainingDays === null ? "" : remainingDays <= 0 ? `${formatNum(Math.abs(remainingDays))} روز از موعد زمانی گذشته` : `${formatNum(remainingDays)} روز تا موعد زمانی`,
      lastEventId: previous.id
    });
  }
  return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Math.min(a.remainingKm ?? Infinity, (a.remainingDays ?? Infinity) * 100) - Math.min(b.remainingKm ?? Infinity, (b.remainingDays ?? Infinity) * 100));
}

async function runDueReminders(env) {
  if (!env.ALLOWED_TELEGRAM_USER_ID) return;
  const events = await loadAllEvents(env);
  const config = await readConfig(env);
  const currentOdo = calculateCurrentOdometer(events);
  const due = calculateDueItems(events, config, currentOdo, nowTehran());
  if (!due.length) return;
  const state = await readJsonFile(FILE_REMINDERS, env, { sent: {} });
  state.sent ||= {};
  const nowMs = Date.now();
  const alertLines = [];
  for (const item of due) {
    const stage = item.overdue ? "overdue" : "warning";
    const key = `${item.key}:${item.lastEventId}:${stage}`;
    const last = Number(state.sent[key] || 0);
    // Warnings send once per service cycle; overdue reminders are throttled to every seven days.
    if (last && (!item.overdue || nowMs - last < 7 * 86400000)) continue;
    alertLines.push(`${item.overdue ? "🔴" : "🟠"} ${item.label}: ${item.kmText}${item.daysText ? `، ${item.daysText}` : ""}`);
    state.sent[key] = nowMs;
  }
  if (alertLines.length) {
    await mutateJsonFile(FILE_REMINDERS, env, () => ({ sent: {} }), current => ({ ...current, sent: { ...(current.sent || {}), ...state.sent }, updatedAt: nowTehran().iso }));
    await sendText(env, env.ALLOWED_TELEGRAM_USER_ID, `🚘 یادآور نگهداری پژو ۲۰۶\nکارکرد فعلی: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}\n\n${alertLines.join("\n\n")}\n\nبرای جزئیات: /due\nبرای ثبت سرویس: /service oil cost=... km=...`, false);
  }
}

async function configReport(env) {
  const config = await readConfig(env);
  const rows = Object.entries(config.serviceIntervals || {}).map(([key, value]) => `${value.label || key} [${key}]\n${value.intervalKm ? `${formatNum(value.intervalKm)} km` : "بدون فاصله کیلومتری"}${value.intervalDays ? ` · ${formatNum(value.intervalDays)} روز` : ""}`);
  const ownership = getOwnershipSettings(config);
  return `⚙️ بازه‌های نگهداری قابل ویرایش\nمدل: ${config.vehicle?.label || "Peugeot 206"}\nکیلومتر خرید: ${formatNum(ownership.purchaseOdometerKm)} km\nبرآورد پیمایش از خرید: ${formatNum(ownership.estimatedKmSincePurchaseKm)} km\n\n${rows.join("\n\n")}\n\nتغییر بازه: /interval engine_oil 5000 180\nتغییر کیلومتر خرید: /purchasekm 428000 estimate=2400\nنام‌های کوتاه انگلیسی و فارسی پشتیبانی می‌شوند.`;
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
  const estimateGap = lifetimeFromPurchase === null ? null : lifetimeFromPurchase - ownership.estimatedKmSincePurchaseKm;
  return `📊 گزارش ${label}\nرویدادها: ${formatNum(events.length)}\nکارکرد فعلی: ${currentOdo === null ? "ثبت نشده" : `${formatNum(currentOdo)} km`}\nمسافت ثبت‌شده در بازه: ${formatNum(trips)} km\nسوخت‌گیری: ${formatNum(fuelLiters)} لیتر\nهزینه سوخت: ${formatMoneyToman(fuelCost)}\nکل هزینه‌های پرداخت‌شده: ${formatMoneyToman(cost)}\n\n🚦 وضعیت جریمه‌های همین بازه\nمجموع جریمه: ${formatMoneyToman(totalFine)}\nپرداخت‌شده: ${formatMoneyToman(paidFine)}\nپرداخت‌نشده: ${formatMoneyToman(unpaid)} (${formatNum(fines.filter(e=>!e.paid).length)} مورد)\n\n👤 از زمان خرید در کیلومتر ${formatNum(ownership.purchaseOdometerKm)}: ${lifetimeFromPurchase === null ? "—" : `${formatNum(lifetimeFromPurchase)} km طبق آخرین کیلومتر ثبت‌شده`}\nبرآورد اعلام‌شده: ${formatNum(ownership.estimatedKmSincePurchaseKm)} km${estimateGap === null ? "" : `\nاختلاف با برآورد: ${estimateGap > 0 ? "+" : ""}${formatNum(estimateGap)} km`}${estimateGap !== null && Math.abs(estimateGap)>150 ? "\n⚠️ اختلاف بیشتر از حد معمول است؛ کیلومتر فعلی را روی خودرو تأیید کن." : ""}\n\n` + Object.entries(typeCounts).map(([type, count]) => `${eventTypeLabel(type)}: ${formatNum(count)}`).join("\n") + `\n\nخروجی CSV: /export all · نمودار تصویری: /analysis month`;
}

async function latestReport(env) {
  const events = (await loadAllEvents(env)).slice(-10).reverse();
  if (!events.length) return "هنوز رویدادی ثبت نشده. با /help نمونه‌ها را ببین.";
  return "🧾 آخرین رویدادها\n\n" + events.map(e => `${e.jalaliDate || e.date} ${e.time || ""} · ${eventTypeLabel(e.type)}\n${e.title}\n${(e.description || "").slice(0, 120)}\nID: ${e.id.slice(0, 8)}${e.odometerKm ? ` · ${formatNum(e.odometerKm)} km` : ""}${e.costRial ? ` · ${formatMoneyToman(e.costRial)}` : ""}`).join("\n\n");
}

async function finesReport(env) {
  const events = (await loadAllEvents(env)).filter(e => e.type === "fine").sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  if (!events.length) return "✅ جریمه‌ای ثبت نشده است.\n\nبرای دیدن کل هزینه‌ها و پیمایش از /summary all استفاده کن.";
  const unpaid = events.filter(e => !e.paid);
  const paid = events.filter(e => e.paid);
  const totalRial = events.reduce((sum,e)=>sum+(Number(e.costRial)||0),0);
  const paidRial = paid.reduce((sum,e)=>sum+(Number(e.costRial)||0),0);
  const unpaidRial = unpaid.reduce((sum,e)=>sum+(Number(e.costRial)||0),0);
  return `🚦 گزارش جامع جریمه‌ها\n\n📋 تعداد کل: ${formatNum(events.length)} مورد\n💰 مجموع مبلغ تمام جریمه‌ها: ${formatMoneyToman(totalRial)}\n✅ مجموع پرداخت‌شده: ${formatMoneyToman(paidRial)} (${formatNum(paid.length)} مورد)\n🔴 بدهی پرداخت‌نشده: ${formatMoneyToman(unpaidRial)} (${formatNum(unpaid.length)} مورد)\n\n🧾 ریزسوابق اخیر\n` + events.slice(0, 25).map(e => `${e.paid ? "✅ پرداخت‌شده" : "🔴 پرداخت‌نشده"} · ${formatMoneyToman(e.costRial || 0)}\n${e.description}\nتاریخ: ${e.jalaliDate || e.date} · شناسه: ${e.id.slice(0, 8)}`).join("\n\n") + "\n\nبرای ثبت پرداخت: /paid شناسه\nبرای گزارش نموداری هزینه‌ها: /analysis month";
}

async function markFinePaid(input, env) {
  const id = (input || "").replace(/[^a-zA-Z0-9-]/g, "").trim();
  const events = await loadAllEvents(env);
  const fines = events.filter(e => e.type === "fine" && !e.paid);
  if (!id) return fines.length ? "شناسه جریمه پرداخت‌شده را بفرست؛ جریمه‌های پرداخت‌نشده:\n" + fines.map(e => `${e.id.slice(0, 8)} · ${formatMoneyToman(e.costRial || 0)} · ${e.description}`).join("\n") : "✅ جریمه پرداخت‌نشده‌ای وجود ندارد.";
  const target = fines.find(e => e.id === id || e.id.startsWith(id));
  if (!target) return "جریمه پرداخت‌نشده‌ای با این شناسه پیدا نشد. برای فهرست: /fines";
  const month = String(target.date).slice(0, 7);
  await mutateJsonFile(`data/logs/${month}.json`, env, () => ({ month, events: [] }), current => {
    current.events ||= [];
    const item = current.events.find(e => e.id === target.id);
    if (item) { item.paid = true; item.paidAt = nowTehran().iso; item.status = "paid"; }
    current.updatedAt = nowTehran().iso;
    return current;
  });
  return `✅ پرداخت جریمه ثبت شد.\nمبلغ: ${formatMoneyToman(target.costRial || 0)}\nشناسه: ${target.id.slice(0, 8)}\nاین جریمه از بدهی پرداخت‌نشده کم شد.`;
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

async function fuelReport(env) {
  const events = await loadAllEvents(env);
  const now = nowTehran();
  const thisMonth = events.filter(e => e.type === "fuel" && String(e.date).slice(0, 7) === now.date.slice(0, 7));
  const allFuel = events.filter(e => e.type === "fuel");
  const totalLiters = rows => rows.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalCost = rows => rows.reduce((s, e) => s + (Number(e.costRial) || 0), 0);
  const full = allFuel.filter(e => e.fullTank && Number.isFinite(e.odometerKm)).sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
  let measuredConsumption = "برای محاسبه مصرف دقیق، هنگام پرکردن کامل باک از گزینه full استفاده کن و کیلومتر هر سوخت‌گیری را ثبت کن.";
  if (full.length >= 2) {
    const a = full[full.length - 2], b = full[full.length - 1];
    const km = Number(b.odometerKm) - Number(a.odometerKm);
    const liters = allFuel.filter(e => Date.parse(e.occurredAt) > Date.parse(a.occurredAt) && Date.parse(e.occurredAt) <= Date.parse(b.occurredAt)).reduce((s, e) => s + (Number(e.liters) || 0), 0);
    if (km > 0 && liters > 0) measuredConsumption = `برآورد بین دو سوخت‌گیری با باک کامل: ${Math.round(liters / km * 1000) / 10} لیتر در ۱۰۰ کیلومتر (${Math.round(km)} km / ${Math.round(liters * 10) / 10} لیتر).`;
  }
  const pricedFuel = allFuel.filter(e => Number(e.costRial) > 0 && Number(e.liters) > 0);
  return `⛽ گزارش سوخت\nماه جاری: ${formatNum(totalLiters(thisMonth))} لیتر · ${formatMoneyToman(totalCost(thisMonth))}\nاز ابتدا: ${formatNum(totalLiters(allFuel))} لیتر · ${formatMoneyToman(totalCost(allFuel))}\nتعداد سوخت‌گیری: ${formatNum(allFuel.length)}\nمیانگین قیمت هر لیتر (فقط رکوردهای دارای مبلغ): ${totalLiters(pricedFuel) ? formatMoneyToman(totalCost(pricedFuel) / totalLiters(pricedFuel)) : "—"}\n\n${measuredConsumption}`;
}

function detectServiceKeys(text, config) {
  const lower = normalizeDigits(String(text || "")).toLowerCase();
  const matches = [];
  for (const [key, aliases] of Object.entries(SERVICE_ALIASES)) {
    if (!config.serviceIntervals?.[key]) continue;
    for (const alias of aliases) {
      const needle = alias.toLowerCase();
      let from = 0;
      while (needle && (from = lower.indexOf(needle, from)) >= 0) {
        matches.push({ key, start: from, end: from + needle.length, length: needle.length, alias: needle });
        from += Math.max(needle.length, 1);
      }
    }
  }
  matches.sort((a, b) => b.length - a.length || a.start - b.start);
  const accepted = [];
  for (const match of matches) {
    const covered = accepted.some(existing => existing.start <= match.start && existing.end >= match.end);
    if (!covered) accepted.push(match);
  }
  const keys = [];
  for (const match of accepted.sort((a, b) => a.start - b.start)) if (!keys.includes(match.key)) keys.push(match.key);
  return keys;
}
function detectServiceKey(text, config) {
  return detectServiceKeys(text, config)[0] || null;
}

async function readConfig(env) {
  return await readJsonFile(FILE_CONFIG, env, { serviceIntervals: {}, vehicle: { label: "Peugeot 206" }, ownership: { purchaseOdometerKm: DEFAULT_PURCHASE_ODOMETER_KM, estimatedKmSincePurchaseKm: DEFAULT_ESTIMATED_KM_SINCE_PURCHASE } });
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
  const headers = ["id", "type", "title", "description", "actor", "note", "occurredAt", "jalaliDate", "date", "time", "odometerKm", "distanceKm", "liters", "costRial", "serviceKey", "paid", "paidAt", "status", "repairDescription", "repairCostRial", "resolvedAt", "fullTank", "updatedAt", "revision"];
  const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...events.map(event => headers.map(key => quote(event[key])).join(","))].join("\r\n");
}

function extractMoneyRial(text) {
  const source = normalizeDigits(String(text || ""));
  const patterns = [
    /(?:هزینه|مبلغ|قیمت|جریمه|پرداخت|cost|price|fine|amount|مجموع|قیمتش)\s*(?:[:=]|حدود|مبلغ)?\s*([\d][\d,._]*)(?:\s*(هزار|میلیون|k|m))?\s*(تومان|تومن|ریال|rial|toman|tomans)?/i,
    /([\d][\d,._]*)\s*(هزار|میلیون|k|m)?\s*(تومان|تومن|ریال|rial|toman|tomans)/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    let amount = parseNumericToken(match[1]);
    if (!Number.isFinite(amount)) continue;
    const multiplier = /میلیون|^m$/i.test(match[2] || "") ? 1000000 : /هزار|^k$/i.test(match[2] || "") ? 1000 : 1;
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
