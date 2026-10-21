const token = process.env.BOT_TOKEN;
const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, "");
const secret = process.env.WEBHOOK_SECRET;

if (!token || !workerUrl || !secret) {
  console.error("Missing required environment variables: BOT_TOKEN, WORKER_URL, WEBHOOK_SECRET");
  console.error("Use CMD: set \"BOT_TOKEN=...\" then set \"WORKER_URL=https://...workers.dev\" and set \"WEBHOOK_SECRET=...\"");
  process.exit(1);
}
if (!/^https:\/\//i.test(workerUrl)) throw new Error("WORKER_URL must start with https://");
if (!/^[A-Za-z0-9_-]{20,256}$/.test(secret)) throw new Error("WEBHOOK_SECRET must be 20–256 characters using A-Z, a-z, 0-9, _ or -.");

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(`${method} failed (${response.status}): ${data.description || "Telegram API error"}`);
  return data.result;
}

const result = await telegram("setWebhook", {
  url: `${workerUrl}/telegram`,
  secret_token: secret,
  allowed_updates: ["message"],
  drop_pending_updates: false,
  max_connections: 20
});
await telegram("setMyCommands", {
  commands: [
    { command: "start", description: "شروع و معرفی 206 Garage" },
    { command: "help", description: "فهرست کامل دستورها" },
    { command: "id", description: "نمایش شناسه تلگرام" },
    { command: "km", description: "ثبت کیلومترشمار خودرو" },
    { command: "trip", description: "ثبت مسافت طی‌شده" },
    { command: "fuel", description: "ثبت بنزین و هزینه سوخت" },
    { command: "service", description: "ثبت سرویس و قطعه" },
    { command: "due", description: "موعد سرویس‌ها و هشدارها" },
    { command: "summary", description: "گزارش روز، هفته یا ماه" },
    { command: "fuelstats", description: "گزارش سوخت و مصرف" },
    { command: "fines", description: "جریمه‌های ثبت‌شده" },
    { command: "export", description: "خروجی CSV" },
    { command: "latest", description: "آخرین رویدادهای ثبت‌شده" }
  ]
});
console.log(JSON.stringify({ ok: true, webhookUrl: result.url, pendingUpdateCount: result.pending_update_count, allowedUpdates: result.allowed_updates }, null, 2));
