# راهنمای کامل جایگزینی و انتشار نسخهٔ 3.22.0

این راهنما برای جایگزینی کامل کد سایت و Worker در مخزن فعلی است. مراحل را به ترتیب انجام بده و قبل از هر جایگزینی از داده‌ها و تنظیمات فعلی نسخهٔ پشتیبان بگیر.

## ۱. قبل از جایگزینی: پشتیبان

از این موارد کپی جداگانه نگه دار:

- کل مخزن فعلی؛
- پوشهٔ `data/`، مخصوصاً `data/logs/`, `data/index.json`, `data/config.json`؛
- تنظیمات Cloudflare Worker و فهرست Secretها؛
- Binding و شناسهٔ KV فعلی با نام `GARAGE_PRIVATE_KV`؛
- تنظیمات Secrets مخزن GitHub Actions.

**هشدار داده:** ZIP بر اساس فایل‌هایی ساخته شده که در زمان دریافت آرشیو در دسترس بوده‌اند. اگر بعد از زمان تهیهٔ ZIP پیام/سوخت‌گیری/جریمهٔ جدیدی در ربات ثبت کرده‌ای، `data/logs/*.json` جدیدتر را با فایل داخل ZIP جایگزین نکن. داده‌های جدیدتر را نگه دار و فقط کدها و مستندات را جایگزین کن. `data/dashboard.json` مشتق‌شده است و بعد از همگام‌سازی لاگ‌های نهایی دوباره ساخته می‌شود.

## ۲. استخراج و جایگزینی GitHub

1. فایل ZIP را استخراج کن.
2. وارد پوشهٔ `peugeot-206-garage-main` شو.
3. محتویات داخل آن (نه خود پوشهٔ والد) را در ریشهٔ مخزن فعلی `mehrdadmb2/peugeot-206-garage` کپی کن.
4. فایل‌های کد و مستندات نسخهٔ جدید را جایگزین کن.
5. داده‌های جدیدتر خودت را مطابق هشدار مرحلهٔ قبل نگه دار.
6. فایل‌های تاریخی قدیمی `CHANGELOG-v*.md`, `FIXES-v*.md`, `PATCH-INSTALL-v*.md`, `UPDATE-v*.md`, `INSTALL-v*.md` و `TEST-RESULTS*.txt` دیگر برای اجرای نسخهٔ جدید لازم نیستند. نسخهٔ جدید فقط `CHANGELOG.md` و راهنماهای داخل `docs/` را نگه می‌دارد.
7. تغییرات را روی شاخهٔ `main` Commit و Push کن.

## ۳. ساخت Snapshot بعد از ادغام داده

در ریشهٔ مخزن با Node.js 22:

```bash
node scripts/build-dashboard.mjs
```

این دستور `data/dashboard.json` را از روی لاگ‌ها و تنظیمات جاری بازسازی می‌کند. این فایل را به‌عنوان منبع اصلی داده ویرایش دستی نکن.

## ۴. تست محلی اختیاری اما توصیه‌شده

```bash
npm --prefix worker install
npm --prefix worker test
npm --prefix worker run check
node worker/test/smoke.mjs
node scripts/build-dashboard.mjs
```

اگر تست یا ساخت Snapshot شکست خورد، قبل از Push علت را بررسی کن. این نسخه باید `calculationVersion: 9` بسازد؛ Snapshot قدیمی نباید دستی دوباره استفاده شود.

## ۵. انتشار GitHub Pages

بعد از Push به `main`:

- Workflow مربوط به Build Dashboard، Snapshot را اعتبارسنجی و بازسازی می‌کند.
- Workflow مربوط به Verify، syntax، تست‌ها و Smoke Worker را اجرا می‌کند.
- GitHub Pages پس از اتمام Workflowها، فایل‌های سایت را منتشر می‌کند.

سایت: `https://mehrdadmb2.github.io/peugeot-206-garage/`

اگر Actions شکست خورد، لاگ مرحلهٔ ناموفق را بخوان؛ Snapshot قدیمی را دستی به‌عنوان خروجی موفق معرفی نکن.

## ۶. حفظ Secrets و تنظیمات Cloudflare

ZIP شامل Secret نیست. مقادیر فعلی Cloudflare را حفظ کن؛ توکن جدید بی‌دلیل نساز و Token را در سورس قرار نده.

متغیرهای runtime که Worker از آن‌ها استفاده می‌کند:

| نام | کاربرد |
|---|---|
| `TELEGRAM_BOT_TOKEN` | دسترسی به Bot API |
| `TELEGRAM_WEBHOOK_SECRET` | اعتبارسنجی وب‌هوک تلگرام |
| `ALLOWED_TELEGRAM_USER_ID` | محدودکردن کاربر مجاز ربات |
| `GITHUB_TOKEN` | خواندن/نوشتن فایل‌های مخزن |
| `API_ACCESS_TOKEN` | محافظت از API عمومی Worker |
| `DOCUMENTS_ACCESS_TOKEN` | احراز هویت API مدارک خصوصی |
| `SCHEDULE_TRIGGER_SECRET` | اعتبارسنجی اجرای زمان‌بندی‌شده |
| `VEHICLE_DOCUMENTS_JSON` | مقدار اولیهٔ اختیاری مدارک خصوصی |

در `worker/wrangler.toml` مالک، نام مخزن و شاخه در `[vars]` مشخص شده‌اند. این مقادیر باید `mehrdadmb2`, `peugeot-206-garage` و `main` باقی بمانند.

## ۷. Binding خصوصی KV

در `worker/wrangler.toml` بخش `GARAGE_PRIVATE_KV` به‌صورت کامنت باقی گذاشته شده، چون شناسهٔ namespace خصوصی باید از Cloudflare حساب خودت برداشته شود.

1. Cloudflare Dashboard → Workers & Pages → Worker مربوط به `peugeot-206-garage-bot` → Settings → Bindings.
2. شناسهٔ Namespace فعلی با Binding دقیق `GARAGE_PRIVATE_KV` را پیدا کن.
3. همان شناسهٔ موجود را در بلوک `[[kv_namespaces]]` فایل `worker/wrangler.toml` قرار بده و کامنت‌ها را بردار.
4. Namespace تازه نساز؛ در صورت اتصال به KV خالی، سوابق مدارک خصوصی قبلی در دسترس Worker جدید نخواهد بود.

## ۸. انتشار Worker

در ترمینال:

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

اگر CLI از تو خواست Environment انتخاب کنی، از همان تنظیمات Production فعلی استفاده کن. پیش از Deploy مطمئن شو Secretها و KV Binding حفظ شده‌اند.

## ۹. بررسی سلامت

پس از Deploy این آدرس باید پاسخ سلامت Worker بدهد:

`https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health`

سپس در تلگرام:

1. `/start`
2. `/fuelstats`
3. `/fines`
4. یک پیامک نمونه را فقط در صورتی ارسال کن که قصد داری آن را به‌عنوان رکورد واقعی ذخیره کنی.

## ۱۰. وب‌هوک تلگرام

اگر نام Worker، دامنه و Bot Token تغییر نکرده باشند، معمولاً نیازی به بازتنظیم Webhook نیست. در صورت دریافت خطای Webhook، آدرس/Secret وب‌هوک فعلی را در Cloudflare و Bot API بررسی کن؛ Secret را در فایل عمومی قرار نده.

## ۱۱. نکات رفع اشکال

- **ربات داده را ثبت نمی‌کند:** `GITHUB_TOKEN`، دسترسی Contents: Read and write، مالک/مخزن/Branch و `ALLOWED_TELEGRAM_USER_ID` را بررسی کن.
- **پیام تلگرام ارسال نمی‌شود:** Secret `TELEGRAM_BOT_TOKEN` و فعال بودن ربات را بررسی کن.
- **401 وب‌هوک:** `TELEGRAM_WEBHOOK_SECRET` با Secret تنظیم‌شده هنگام ثبت Webhook تطبیق ندارد.
- **مدارک خصوصی باز نمی‌شود:** `GARAGE_PRIVATE_KV` باید به همان Namespace قبلی متصل باشد و `DOCUMENTS_ACCESS_TOKEN` صحیح باشد.
- **داشبورد عدد قدیمی نشان می‌دهد:** Actions و `calculationVersion: 9` در `data/dashboard.json` را بررسی کن؛ ابتدا لاگ‌ها را حفظ و سپس Snapshot را بازسازی کن. پس از Deploy در مرورگر `Ctrl+F5` بزن.
- **تاریخ شمسی یک روز اختلاف دارد:** ساعت/تاریخ رویداد خام و timezone را بررسی کن. نمایش نسخهٔ جدید باید از `occurredAt` در `Asia/Tehran` ساخته شود، نه از فیلد cacheشدهٔ `jalaliDate`.
- **کارکرد عقب‌تر از آخرین ثبت دیده می‌شود:** گزارش `/km` را با رویدادهای مشکوک مقایسه کن. قرائت کاهشی بدون پرچم reset عمداً پذیرفته نمی‌شود؛ در صورت تعویض واقعی کیلومترشمار، reset صریح باید روی همان رویداد ثبت شود.
- **مدل سوخت تخمین نمی‌دهد:** کیلومتر ثبت‌های سوخت را بررسی کن؛ دو یا چند رکورد معتبر و حداقل ۱۰۰ کیلومتر فاصله نیاز است. باک کامل لازم نیست. قرائت کیلومترهای میانی برای پیمایش و استنباط کیلومتر سوخت‌گیری استفاده می‌شود، اما بدون لیتر یا سطح باک نمی‌توان از آن مقدار سوخت مصرف‌شده را اندازه گرفت.
- **جریمه دوربینی موعد نمی‌گیرد:** این رفتار عمدی است؛ فقط نوع صریح دوبرگی موعد خودکار می‌گیرد. اگر یادآور شخصی می‌خواهی، deadline دستی ثبت کن؛ این یادآور مبلغ را دوبرابر نمی‌کند.

## ۱۲. چه چیزی Deploy نشده است؟

این بسته خروجی آمادهٔ جایگزینی است؛ آماده‌بودن فایل‌ها به معنی Push شدن به GitHub یا Deploy شدن Worker نیست. این دو کار باید در حساب GitHub و Cloudflare خودت انجام شوند.
