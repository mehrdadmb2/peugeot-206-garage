# 206 Garage · Peugeot 206 Vehicle OS

دفتر هوشمند و شخصی خودروی پژو ۲۰۶ مدل ۱۳۸۷ با ربات تلگرام، Cloudflare Worker و داشبورد چندبخشی GitHub Pages.

## معماری و اصل ذخیره‌سازی

- **همه‌ی عملیات درخواست‌محور هستند.** Worker به‌محض دریافت Webhook تلگرام یا HTTP API اجرا می‌شود؛ هیچ Cron، Trigger دوره‌ای یا سرویس همیشه‌روشن برای ثبت عادی لازم نیست.
- برای رویداد جدید، Worker ابتدا فایل ماه رویداد (`data/logs/YYYY-MM.json`) و سپس فهرست ماه‌ها/زمان آخرین تغییر (`data/index.json`) را با GitHub Contents API می‌نویسد. پاسخ موفق ثبت، پس از پایان هر دو commit برمی‌گردد. اگر نوشتن GitHub ناموفق شود، پاسخ موفق ثبت داده نمی‌شود.
- گزارش‌های ربات و API داده‌ی ذخیره‌شده در GitHub را می‌خوانند؛ داشبورد Pages فایل‌های JSON منتشرشده را می‌خواند. ممکن است نمایش عمومی Pages پس از commit کمی دیرتر به‌روزرسانی شود؛ خود ثبت Worker منتظر پایان نوشتن GitHub می‌ماند.
- یادآورهای پیش‌دستانه که بدون هیچ درخواست و در یک زمان مشخص خودشان پیام بفرستند، با Worker کاملاً request-driven ممکن نیستند. در این معماری `/due`، `/summary` و هر درخواست دیگر در لحظه، موعدها را محاسبه می‌کند. برای اعلان خودکار زمان‌بندی‌شده باید عمداً Cron یا سرویس زمان‌بندی جداگانه اضافه شود؛ در این نسخه وجود ندارد.
- مخزن حاوی سوابق عمومی است اگر visibility روی Public باشد. اطلاعات حساس، نشانی‌ها یا جزئیات قابل شناسایی را ثبت نکن.

## نام‌ها

- Repository: `peugeot-206-garage`
- Worker: `peugeot-206-garage-bot`
- Bot display name: `206 Garage | دفتر هوشمند خودرو`
- Telegram username هدف: `@Peugeot206GarageBot` (از قبل توسط مالک معرفی شده است)
- خودرو در تنظیمات: Peugeot 206 Type 2، مدل ۱۳۸۷. Type 2 هاچ‌بک است؛ 206 SD سدان است. تصویر سینمایی SD فقط پس‌زمینه است و تصویر برداری صفحه نمای هاچ‌بک دارد.

## 1. بارگذاری فایل‌ها در GitHub

محتویات پروژه را در ریشه‌ی مخزن `mehrdadmb2/peugeot-206-garage` قرار بده؛ فایل `index.html` باید مستقیماً در ریشه باشد. در `Settings → Pages` گزینه‌ی `Deploy from a branch`، شاخه‌ی `main` و مسیر `/(root)` را انتخاب کن.

فایل‌های مهم:

```text
index.html
site.webmanifest
assets/css/style.css
assets/js/app.js
assets/img/favicon.svg
assets/img/206-white.svg
assets/img/206-sd-garage.webp
data/config.json
data/index.json
data/logs/
worker/src/index.js
worker/wrangler.toml
worker/package.json
worker/scripts/set-webhook.mjs
worker/tests/worker.test.mjs
```

## 2. ساخت GitHub token

در تنظیمات GitHub یک Fine-grained personal access token بساز که فقط به مخزن `mehrdadmb2/peugeot-206-garage` دسترسی داشته باشد و **Contents: Read and write** داشته باشد. توکن را در فایل، HTML، README، GitHub Actions، یا پیام‌های قابل مشاهده قرار نده.

## 3. نصب و انتشار Cloudflare Worker در Windows CMD

Node.js نسخه‌ی پشتیبانی‌شده و npm را نصب داشته باش. CMD (نه PowerShell) را باز کن:

```cmd
cd path\to\peugeot-206-garage\worker
npm install
npm test
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
npx wrangler secret put API_ACCESS_TOKEN
npx wrangler deploy
```

هر `secret put` به‌صورت تعاملی مقدار جداگانه می‌گیرد. مقادیر:

- `GITHUB_TOKEN`: توکن با مجوز Contents read/write برای همان مخزن.
- `TELEGRAM_BOT_TOKEN`: توکن واقعی BotFather؛ آن را با هیچ‌کس به اشتراک نگذار.
- `TELEGRAM_WEBHOOK_SECRET`: یک مقدار تصادفی ۲۰ تا ۲۵۶ کاراکتری با حروف انگلیسی، اعداد، `_` یا `-`؛ برای ساخت دستی از مولد رمز امن استفاده کن.
- `ALLOWED_TELEGRAM_USER_ID`: شناسه‌ی عددی حساب تلگرام مجاز. Bot خصوصی است و شناسه‌ی کاربر باید دقیقاً با آن برابر باشد.
- `API_ACCESS_TOKEN`: یک رمز تصادفی جداگانه و قوی با حداقل ۳۲ کاراکتر؛ فقط برای API غیرتلگرامی است.

مالک/نام مخزن/شاخه در `worker/wrangler.toml` تنظیم شده‌اند. اگر نام یا شاخه تغییر کرد آن فایل را قبل از deploy اصلاح کن. این Worker هیچ بخش `[triggers]` ندارد و هیچ `scheduled()` handler تعریف نمی‌کند.

## 4. اتصال Webhook و منوی فرمان‌های تلگرام

بعد از deploy، URL منتشرشده را از خروجی Wrangler بردار. در همان پنجره‌ی CMD مقدارها را تنظیم کن (مقادیر واقعی خودت را وارد کن):

```cmd
set "BOT_TOKEN=توکن_واقعی_BotFather"
set "WORKER_URL=https://peugeot-206-garage-bot.game-developer-mb.workers.dev"
set "WEBHOOK_SECRET=همان_Telegram_Webhook_Secret"
node scripts/set-webhook.mjs
```

اگر URL نهایی Worker متفاوت بود، همان URL را وارد کن. اسکریپت Webhook و منوی دستورهای BotFather را ثبت می‌کند. پس از آن `/start` و `/help` را در تلگرام امتحان کن.

## 5. فرمان‌ها و ورودی طبیعی

```text
/km 156000
/trip 85
/fuel 20l cost=700000 toman km=156200 full
/service engine_oil cost=900000 toman km=156000
/interval engine_oil 4000 180
/due
/summary week
/fuelstats
/fines
/paid a1b2c3d4
/wash 180000 toman
/repair جلوبندی cost=450000 toman
/export 2026-10
```

پیام ساده نیز پشتیبانی می‌شود:

```text
امروز با کیلومتر ۱۵۶۲۸۰ به خانه برگشتم
امروز ۲۰ لیتر بنزین زدم، ۷۰۰ هزار تومان، کیلومتر ۱۵۶۲۰۰ و باک کامل
روغن موتور و فیلتر روغن را عوض کردم، هزینه ۱ میلیون تومان، کیلومتر ۱۵۶۲۰۰
خرابی: صدای جلوبندی
جریمه سرعت ۵۰۰ هزار تومان
پرداخت جریمه با شناسه a1b2c3d4
کارواش ۱۸۰ هزار تومان
note: صدای غیرعادی را در مراجعه بعدی بررسی کنم
```

ارقام فارسی/عربی و انگلیسی نرمال می‌شوند. برای ورود تاریخ/ساعت دستی، زمان دقیق و منطقه‌ی زمانی ایران را ذکر کن؛ زمان پیش‌فرض از زمان پیام تلگرام و `Asia/Tehran` استفاده می‌کند. عبارت‌های آزاد ذاتاً می‌توانند مبهم باشند؛ برای موردهای حیاتی از فرمان صریح مثل `/km`، `/fuel` و `/service` استفاده کن. دستور ناشناخته‌ی اسلش دیگر بی‌صدا به یادداشت تبدیل نمی‌شود و راهنما را می‌فرستد. برای یادداشت آزاد از `note:` یا `/note` استفاده کن.

### واحد پول

مقادیر رویدادهای داخل فایل JSON خام با نام `costRial` در ریال ذخیره می‌شوند و داشبورد آن را بر ۱۰ تقسیم می‌کند تا تومان نمایش بدهد. در ورودی طبیعی، بهتر است واحد «تومان» یا «ریال» را صریح بنویسی. برای API تایپ‌شده، `costRial` باید عدد ریالی باشد.

### سرویس‌ها و یادآورها

بازه‌ها در `data/config.json` فقط مقدارهای اولیه‌اند؛ فاصله‌ی نهایی سرویس را بر اساس دفترچه/نوع موتور، کیفیت قطعه، شرایط رانندگی و متخصص تنظیم کن. مثلاً `/interval engine_oil 4000 180` فاصله‌ی یادآوری را به ۴۰۰۰ کیلومتر یا ۱۸۰ روز تنظیم می‌کند. محاسبه بر اساس آخرین سرویس ثبت‌شده و کیلومترهای واردشده است و جایگزین بررسی فنی نیست.

## 6. REST API برای هر برنامه‌ی دیگر

برای ثبت از برنامه، دستگاه، فرم یا اسکریپت (بدون ارسال از تلگرام)، هدر `Authorization: Bearer <API_ACCESS_TOKEN>` و JSON ارسال کن. همه‌ی درخواست‌های API به‌صورت زنده اجرا می‌شوند و بعد از commit برمی‌گردند.

**ثبت پیام با همان parser تلگرام:**

```cmd
curl.exe -X POST "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/api/v1/record" ^
  -H "Authorization: Bearer YOUR_API_ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  --data-binary "{\"text\":\"20l fuel, cost 700000 toman, km 156200\"}"
```

**ثبت رویداد تایپ‌شده:**

```json
{
  "type": "fuel",
  "title": "سوخت‌گیری",
  "description": "20 liters; full tank",
  "occurredAt": "2026-10-21T18:30:00+03:30",
  "odometerKm": 156200,
  "liters": 20,
  "costRial": 7000000,
  "fullTank": true
}
```

در رویداد تایپ‌شده `costRial` ریال است؛ مثال فوق هفت میلیون ریال (۷۰۰ هزار تومان) است.

| Endpoint | کاربرد |
|---|---|
| `GET /` | معرفی Worker و فهرست مسیرها |
| `GET /health` | بررسی سلامت بدون نمایش رازها |
| `POST /telegram` | Webhook تلگرام؛ با Secret Header |
| `POST /api/v1/record` | ثبت پیام طبیعی یا رویداد تایپ‌شده |
| `POST /api/v1/command` | alias برای ثبت/فرمان‌ها |
| `GET /api/v1/overview` | نمای آماری کامل ذخیره‌شده |
| `GET /api/v1/events?month=2026-10&type=fuel&limit=500` | خواندن رویدادها |
| `GET /api/v1/due` | محاسبه‌ی موعد سرویس‌ها |
| `GET /api/v1/config` | تنظیمات خودرو و بازه‌ها |
| `GET /api/v1/export?month=2026-10` | خروجی CSV یک ماه |

تمام مسیرهای `/api/v1/*` به‌جز درخواست preflight نیازمند API token هستند؛ توکن را در GitHub Pages سمت مرورگر قرار نده. API برای برنامه‌های کنترل‌شده است و نه برای embed مستقیم در یک سایت عمومی.

## 7. داشبورد GitHub Pages

- ۸ بخش: داشبورد، سرویس‌ها، سوخت، تحلیل، هزینه‌ها، جریمه/خرابی، دفتر وقایع، راهنما و API.
- نمودارهای SVG محلی، فیلتر رویداد و ماه، خروجی CSV/JSON، جست‌وجو، کارت‌های KPI، سوخت و هزینه دسته‌بندی‌شده، خرابی‌های باز و جریمه‌های پرداخت‌نشده.
- Loader هنگام خواندن GitHub JSON، تصویر سینمایی پس‌زمینه، تصویر اختصاصی ۲۰۶ هاچ‌بک، favicon و Web Manifest.
- داشبورد مستقیم از `data/index.json`, `data/config.json` و `data/logs/*.json` خوانده می‌شود و برای داده‌ها نیازی به قرار دادن GitHub token در مرورگر ندارد.

GitHub Pages محتوای فایل‌های commitشده را در انتشار استاتیک ارائه می‌کند، بنابراین پس از commit ممکن است کمی زمان لازم باشد تا build منتشر و cache مرورگر به‌روزرسانی شود. دکمه‌ی تازه‌سازی داشبورد درخواست مجدد برای JSONها انجام می‌دهد، اما زمان انتشار GitHub Pages را کنترل نمی‌کند.

## 8. تست محلی

```cmd
cd path\to\peugeot-206-garage\worker
npm test
```

تست‌ها با GitHub/Telegram واقعی تماس نمی‌گیرند؛ APIها mock شده‌اند. قبل از استفاده، ابتدا `GET /health`، سپس `/start` و یک ثبت آزمایشی واقعی را بررسی کن.

## حریم خصوصی و پایداری

- در مخزن عمومی، هر رویداد، مبلغ، زمان و کیلومتر ثبت‌شده برای عموم قابل مشاهده می‌شود.
- GitHub Contents API برای هر فایل یک commit می‌سازد. یک رویداد معمولاً دو commit (فایل ماه و index) ایجاد می‌کند؛ این نیاز مستقیمِ ذخیره‌سازی بی‌درنگ است، اما در استفاده‌ی بسیار پرتکرار می‌تواند به rate limit GitHub برسد.
- Worker retry محدود برای conflict دارد؛ هیچ سیستم توزیع‌شده‌ای نمی‌تواند در برابر دسترسی لغوشده، اختلال GitHub یا تمام شدن quota تضمین ذخیره‌سازی صددرصدی بدهد. در این حالت باید خطا را برطرف و رویداد را دوباره ثبت کنی؛ هرگز پیام موفقیت را به‌عنوان تضمینِ ذخیره‌ی خارج از مخزن تلقی نکن.
- اطلاعات این برنامه دفتر شخصی نگهداری است، نه دیاگ خودرویی؛ سلامت قطعات و توصیه‌های فنی را با دفترچه و متخصص بررسی کن.
