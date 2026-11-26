# راهنمای کامل جایگزینی و انتشار نسخهٔ 3.27.0

این ZIP شامل کل پروژهٔ سایت، Worker/ربات، داده‌های موجود، تست‌ها و راهنماهاست. قبل از جایگزینی از مخزن و `data/` نسخهٔ پشتیبان بگیر.

## ۱. قبل از جایگزینی

از این موارد نسخهٔ پشتیبان نگه دار:

- کل مخزن فعلی؛
- پوشهٔ `data/` شامل `logs/`, `config.json`, `index.json`, `dashboard.json` و فایل‌های وضعیت؛
- Secrets فعلی Cloudflare؛
- Binding و Namespace موجود `GARAGE_PRIVATE_KV`؛
- Secrets و Variables مخزن GitHub Actions.

**داده‌های جدیدتر:** ZIP بر اساس فایل‌هایی ساخته شده که هنگام دریافت آرشیو در دسترس بودند. اگر بعد از آن پیام، سوخت‌گیری، جریمه یا سرویس جدیدی ثبت کرده‌ای، لاگ‌ها و تنظیمات جدیدتر را نگه دار. فایل `data/dashboard.json` مشتق‌شده است و پس از ادغام داده باید دوباره ساخته شود.

## ۲. جایگزینی فایل‌ها در GitHub

۱. ZIP را استخراج کن.
۲. وارد پوشهٔ `peugeot-206-garage-main` شو.
۳. محتویات داخل آن را (نه پوشهٔ والد را) در ریشهٔ مخزن `mehrdadmb2/peugeot-206-garage` کپی و جایگزین کن.
۴. اگر فایل‌های داده در مخزن محلی جدیدترند، آن‌ها را با نسخهٔ داخل ZIP بازنویسی نکن.
۵. فایل‌های قدیمی مانند `docs/QUICK-UPDATE-FA.md` حذف شده‌اند؛ README و راهنماهای جدید داخل `docs/` مرجع انتشار هستند.
۶. تغییرات را روی شاخه `main` Commit و Push کن.

## ۳. بازسازی Snapshot و آزمون

Node.js 22 یا جدیدتر:

```powershell
npm --prefix worker install
npm --prefix worker test
npm --prefix worker run check
node scripts/build-dashboard.mjs
```

در صورت ادغام لاگ‌های جدیدتر، حتماً Snapshot را پس از ادغام بازسازی کن. `data/dashboard.json` را دستی ویرایش نکن.

## ۴. انتشار سایت

پس از Push به `main`، GitHub Actions تست و ساخت Snapshot را اجرا می‌کند و GitHub Pages نسخهٔ جدید را منتشر می‌کند:

`https://mehrdadmb2.github.io/peugeot-206-garage/`

پس از انتشار، در مرورگر `Ctrl + F5` بزن تا فایل‌های CSS/JS قدیمی از Cache کنار گذاشته شوند.

## ۵. Deploy ربات با Wrangler

از پوشهٔ `worker`:

```powershell
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

این دستور Worker فعلی با نام `peugeot-206-garage-bot` را Deploy می‌کند. توکن‌ها در کد قرار داده نشده‌اند؛ Secretهای موجود را حفظ کن.

## ۶. متغیرها و Secretهای Worker

متغیرهای عمومی مخزن در `worker/wrangler.toml` هستند:

- `GITHUB_OWNER=mehrdadmb2`
- `GITHUB_REPO=peugeot-206-garage`
- `GITHUB_BRANCH=main`

Secretهای runtime که ممکن است در حساب Cloudflare موجود باشند:

| نام | کاربرد |
|---|---|
| `TELEGRAM_BOT_TOKEN` | ارسال/دریافت از Bot API |
| `TELEGRAM_WEBHOOK_SECRET` | اعتبارسنجی Webhook تلگرام |
| `ALLOWED_TELEGRAM_USER_ID` | محدودکردن ربات به حساب مجاز |
| `GITHUB_TOKEN` | خواندن/نوشتن فایل‌های مخزن |
| `API_ACCESS_TOKEN` | API محافظت‌شده |
| `DOCUMENTS_ACCESS_TOKEN` | دسترسی به مدارک خصوصی |
| `SCHEDULE_TRIGGER_SECRET` | درخواست‌های یادآور زمان‌بندی‌شده |
| `VEHICLE_DOCUMENTS_JSON` | داده اولیه اختیاری مدارک خصوصی |

برای ورود مجدد Secretها، در ترمینال تعاملی:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
npx wrangler secret put GITHUB_TOKEN
```

مقادیر واقعی را در چت، README یا فایل کد قرار نده. اگر Secretها از قبل تنظیم شده‌اند، صرفاً به‌خاطر Deploy دوباره تغییرشان نده.

## ۷. Binding خصوصی KV

در `worker/wrangler.toml` بخش `GARAGE_PRIVATE_KV` کامنت است، چون ID محرمانهٔ Namespace به حساب Cloudflare مالک تعلق دارد. همان Namespace موجود را در Cloudflare به Worker متصل کن؛ Namespace جدید و خالی نساز، چون مدارک خصوصی قبلی در فضای موجود نگهداری می‌شوند.

## ۸. کنترل پس از Deploy

۱. آدرس `/health` را باز کن:

`https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health`

۲. بررسی کن نسخه `3.27.0` باشد و متغیرهای الزامی Telegram/GitHub تنظیم‌شده باشند. پاسخ Health مقدار Secretها را نشان نمی‌دهد.
۳. در چت خصوصی ربات `/start` و `/guide` را بفرست.
۴. این فرمان‌ها را آزمایش کن:

```text
/vehicle
/partinfo باتری
/catalog
/services
/fuelstats
/analysis week
```

۵. متن یک قبض آزمایشی واقعی را فقط در صورتی ارسال کن که می‌خواهی واقعاً در سوابق خودرو ثبت شود؛ تست‌های خودکار از داده‌های نمونه استفاده می‌کنند و چیزی در Production ثبت نمی‌کنند.

## ۹. عیب‌یابی

- **ربات پیام نمی‌دهد:** `/health`، Secretهای تلگرام و Webhook را بررسی کن.
- **ثبت رویداد در GitHub شکست می‌خورد:** اعتبار `GITHUB_TOKEN`، دسترسی Contents: Read/Write، نام مخزن و شاخه را بررسی کن.
- **مدارک خصوصی باز نمی‌شوند:** Token مدارک و Binding موجود `GARAGE_PRIVATE_KV` را بررسی کن. این موضوع با دادهٔ عمومی `data/config.json` ارتباطی ندارد.
- **سایت اطلاعات قدیمی نشان می‌دهد:** `data/index.json` و فایل‌های ماهانه را بررسی و `node scripts/build-dashboard.mjs` را مجدداً اجرا کن؛ سپس Cache مرورگر را تازه کن.
- **نمودار تلگرام ارسال نمی‌شود:** متن گزارش همچنان باید ارسال شود. ارتباط خروجی QuickChart، پاسخ PNG و خطاهای Worker را بررسی کن.
- **مشخصات Euro/موتور:** آن‌ها مرجع تیپ‌اند، نه تأیید خودرو. برای قطعی‌سازی کد موتور و اسناد را تطبیق بده.
