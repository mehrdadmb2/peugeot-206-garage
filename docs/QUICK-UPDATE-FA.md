# نصب سریع به‌روزرسانی 206 Garage OS نسخهٔ 3.23.0

این راهنما برای ZIP با نام `peugeot-206-garage-v3.23.0-source-update.zip` است. این ZIP فقط فایل‌های تغییرکردهٔ کد، تست و مستندات را دارد و پوشهٔ `data/` را ندارد؛ بنابراین برای جایگزینی روی مخزن فعلی امن‌تر است.

## ۱. پشتیبان و جایگزینی کد

1. از کل مخزن فعلی یک کپی پشتیبان بگیر.
2. ZIP به‌روزرسانی را مستقیماً داخل ریشهٔ مخزن محلی `peugeot-206-garage` استخراج کن و اجازه بده فایل‌های هم‌نام جایگزین شوند.
3. پوشهٔ `data/` و فایل `worker/wrangler.toml` فعلی خودت را حفظ کن. ZIP اصلاحی عمداً این دو را ندارد.
4. اگر داخل `data/` بعد از فایل ZIP اصلی رویداد تازه ثبت شده، همان داده‌های فعلی باید در مخزن باقی بمانند؛ هیچ فایل لاگی را از ZIP کامل قدیمی جایگزین نکن.

## ۲. بررسی محلی با PowerShell

از ریشهٔ مخزن:

```powershell
node --version
npm --prefix .\worker test
npm --prefix .\worker run check
node .\worker\test\smoke.mjs
```

در نسخهٔ آماده‌شده باید ۱۱۹ تست با وضعیت Pass تمام شوند. اگر تست‌ها خطا دارند، قبل از انتشار، متن همان خطا را بررسی کن.

## ۳. ثبت تغییرات در GitHub

```powershell
git status --short
```

مطمئن شو فایل‌های `data/` به‌دلیل تغییرات محلی یا ثبت‌های جدید ناخواسته وارد Commit نشده‌اند. سپس فقط فایل‌های کد و مستندات به‌روزرسانی را Stage کن و منتشر کن؛ یا از GitHub Desktop استفاده کن.

```powershell
git add README.md CHANGELOG.md index.html .github/workflows/build-dashboard.yml
 git add assets/js/app.js assets/js/data-loader.js assets/js/diagnostics.js assets/js/experience.js assets/js/fine-intelligence.mjs assets/js/server-clock.js assets/js/vehicle-documents.js
 git add scripts/build-dashboard.mjs scripts/experience.test.mjs
 git add worker/package.json worker/src/index.js worker/scripts/set-webhook.mjs
 git add worker/tests/dashboard-loader.test.mjs worker/tests/fine-intelligence.test.mjs worker/tests/server-clock.test.mjs worker/tests/worker.test.mjs
 git add docs/DEPLOYMENT-FA.md docs/FUEL-MODEL-FA.md docs/ODOMETER-DATE-RELIABILITY-FA.md docs/QUICK-UPDATE-FA.md
 git status --short
 git commit -m "Fix authoritative Tehran clock and Telegram webhook"
 git push origin main
```

قبل از Commit دوباره `git status --short` را بخوان و مطمئن شو `data/` و فایل‌های محرمانه Stage نشده‌اند.

## ۴. تنظیم و انتشار Cloudflare Worker

ابتدا در مرورگر این URL را بررسی کن:

`https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health`

پاسخ فعلیِ بررسی‌شده نسخهٔ 3.22.0 را نشان می‌دهد و وضعیت‌های اصلی Telegram و GitHub در آن `false` هستند. برای ربات، Secretهای Production را در Cloudflare دوباره با مقادیر صحیح تنظیم کن. از ریشهٔ مخزن:

```powershell
cd .\worker
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
npx wrangler secret put GITHUB_TOKEN
```

مقادیر را در سورس یا چت قرار نده. شناسهٔ `ALLOWED_TELEGRAM_USER_ID` باید عددی و متعلق به حساب مجاز استفاده‌کننده باشد. توکن GitHub باید اجازهٔ خواندن و نوشتن Contents در مخزن `mehrdadmb2/peugeot-206-garage` داشته باشد.

اگر از گاوصندوق مدارک استفاده می‌کنی، Binding قبلی `GARAGE_PRIVATE_KV` را با Namespace موجود خودت حفظ کن؛ شناسه‌ای را حدس نزن و Namespace جدید خالی نساز. سپس:

```powershell
npm install
npx wrangler login
npx wrangler deploy
```

## ۵. ثبت دوبارهٔ Webhook و کنترل تلگرام

در همان پوشهٔ `worker`:

```powershell
$env:BOT_TOKEN = Read-Host "Telegram bot token"
$env:WORKER_URL = "https://peugeot-206-garage-bot.game-developer-mb.workers.dev"
$env:WEBHOOK_SECRET = Read-Host "همان TELEGRAM_WEBHOOK_SECRET تنظیم‌شده در Cloudflare"
node .\scripts\set-webhook.mjs
Remove-Item Env:BOT_TOKEN
Remove-Item Env:WORKER_URL
Remove-Item Env:WEBHOOK_SECRET
```

اسکریپت، هویت ربات را می‌خواند، Webhook را با `message` و `callback_query` ثبت می‌کند، فرمان‌ها را به‌روزرسانی می‌کند و سپس آخرین وضعیت Webhook را بررسی می‌کند. مقدار `lastErrorMessage` باید خالی باشد. Secret واردشده در این مرحله باید دقیقاً با `TELEGRAM_WEBHOOK_SECRET` در Worker یکی باشد.

## ۶. تأیید ساعت و سایت

1. `/health` را دوباره باز کن. نسخه باید `3.23.0` باشد و `epochMs`، `serverTime` و `time` معتبر باشند.
2. در همان پاسخ، `configured.telegram` و اجزای آن (`telegramBotToken`، `telegramWebhookSecret`، `allowedTelegramUserId`) و همین‌طور `configured.github` و اجزای آن باید `true` باشند.
3. داشبورد را با `Ctrl+F5` تازه‌سازی کن. ساعت بالای صفحه باید از Worker همگام شود و عنوان آن وضعیت همگام‌سازی سرور را نشان دهد.
4. در گفت‌وگوی خصوصی ربات `/start`، `/id` و یک فرمان فقط-خواندنی مثل `/fuelstats` را آزمایش کن. برای آزمون ثبت، فقط یک رویداد واقعی و موردنیاز ارسال کن.

## نکتهٔ مهم

فایل‌های آماده شده‌اند اما این بسته به‌تنهایی GitHub را Push یا Worker را Deploy نمی‌کند. Secretها، شناسهٔ KV و تنظیمات حساب باید در GitHub و Cloudflare خودت تنظیم شوند. برای جزئیات بیشتر، `docs/DEPLOYMENT-FA.md` را بخوان.
