const token = process.env.BOT_TOKEN;
const workerUrl = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const secret = process.env.WEBHOOK_SECRET;

if (!token || !workerUrl || !secret) {
  console.error('Missing variables. Set BOT_TOKEN, WORKER_URL and WEBHOOK_SECRET in CMD, then run: node scripts/set-webhook.mjs');
  process.exit(1);
}
if (!/^https:\/\//i.test(workerUrl)) {
  console.error('WORKER_URL must start with https://');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('WEBHOOK_SECRET must contain only A-Z, a-z, 0-9, underscore or hyphen (max 256 chars).');
  process.exit(1);
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`${method} failed: ${JSON.stringify(data)}`);
  return data;
}

try {
  const webhook = await telegram('setWebhook', {
    url: `${workerUrl}/telegram`,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false
  });
  console.log('Webhook:', webhook.description || 'configured');
  const commands = [
    ['start', 'شروع و نمایش راهنما'], ['help', 'راهنمای کامل و مثال‌ها'], ['id', 'شناسه تلگرام'],
    ['km', 'ثبت کیلومترشمار فعلی'], ['trip', 'ثبت مسافت طی‌شده'], ['fuel', 'ثبت سوخت‌گیری'],
    ['service', 'ثبت سرویس و قطعه مصرفی'], ['part', 'ثبت قطعه'], ['interval', 'تغییر بازه سرویس'],
    ['due', 'موعد سرویس‌های بعدی'], ['summary', 'گزارش هزینه و استفاده'], ['fuelstats', 'آمار بنزین و مصرف'],
    ['fines', 'فهرست جریمه‌ها'], ['paid', 'ثبت پرداخت جریمه'], ['repair', 'ثبت تعمیر یا رفع خرابی'],
    ['wash', 'ثبت کارواش'], ['expense', 'ثبت هزینه متفرقه'], ['note', 'یادداشت خودرو'],
    ['export', 'دریافت خروجی CSV'], ['config', 'تنظیمات سرویس‌ها'], ['latest', 'آخرین رویدادها']
  ].map(([command, description]) => ({ command, description }));
  const registered = await telegram('setMyCommands', { commands });
  console.log('Bot commands:', registered.description || 'registered');
  console.log(`Done. Send /start to your bot. Webhook URL: ${workerUrl}/telegram`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
