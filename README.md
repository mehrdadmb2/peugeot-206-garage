<div align="center">
  <img src="assets/img/favicon.svg" width="112" height="112" alt="206 Garage logo" />
  <h1>🚘 206 Garage OS</h1>
  <p><strong>دفتر هوشمند و تحلیلی پژو ۲۰۶ SD</strong></p>
  <p>ثبت سوخت، کیلومتر، رانندگی، سرویس، هزینه، جریمه و تعمیرات؛ از تلگرام تا داشبورد زندهٔ GitHub Pages.</p>

  <p>
    <a href="https://mehrdadmb2.github.io/peugeot-206-garage/"><img src="https://img.shields.io/badge/GitHub%20Pages-Live%20Dashboard-40e5f4?style=for-the-badge&logo=github&logoColor=white" alt="Open dashboard"></a>
    <a href="https://t.me/Peugeot206GarageBot"><img src="https://img.shields.io/badge/Telegram-%40Peugeot206GarageBot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram bot"></a>
    <a href="https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health"><img src="https://img.shields.io/badge/Cloudflare-Worker%20API-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Worker health"></a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Version-3.2.0-8b5cf6?style=flat-square" alt="Version 3.2.0">
    <img src="https://img.shields.io/badge/Runtime-Request--driven-16a34a?style=flat-square" alt="Request driven">
    <img src="https://img.shields.io/badge/Language-Persian%20%2B%20English-2563eb?style=flat-square" alt="Persian and English">
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT license">
  </p>
</div>

<p align="center">
  <img src="assets/img/206-sd-garage.webp" width="92%" alt="White Peugeot 206 SD in a dark cinematic garage" />
</p>

> **نسخهٔ پروژه:** Garage OS 3.2.0 · **خودرو:** پژو ۲۰۶ SD سفید، مدل ۱۳۸۷ · **منطقهٔ زمانی:** `Asia/Tehran`
>
> این پروژه برای ثبت شخصی سابقهٔ خودرو طراحی شده است. **قبل از جایگزینی فایل‌ها، از پوشهٔ `data/` پشتیبان بگیر.** فایل‌های ماهانه، مبنای خرید و تنظیمات سرویس‌ها بخشی از اطلاعات واقعی خودرو هستند.

---

## 🧭 فهرست مطالب

- [معرفی و قابلیت‌ها](#-معرفی-و-قابلیتها)
- [سامانه چگونه کار می‌کند؟](#-سامانه-چگونه-کار-میکند)
- [شروع سریع](#-شروع-سریع)
- [تمام فرمان‌های ربات](#-تمام-فرمانهای-ربات)
- [نمونه‌های ثبت طبیعی فارسی](#-نمونههای-ثبت-طبیعی-فارسی)
- [مبنای کیلومتر خرید](#-مبنای-کیلومتر-خرید)
- [راهنمای BotFather](#-راهنمای-botfather)
- [نصب و انتشار GitHub Pages](#-نصب-و-انتشار-github-pages)
- [تنظیم Cloudflare Worker](#-تنظیم-cloudflare-worker)
- [ثبت وب‌هوک تلگرام](#-ثبت-وبهوک-تلگرام)
- [API](#-api)
- [ساختار فایل‌ها و داده‌ها](#-ساختار-فایلها-و-دادهها)
- [امنیت و حریم خصوصی](#-امنیت-و-حریم-خصوصی)
- [آزمایش و عیب‌یابی](#-آزمایش-و-عیبیابی)

## 🚀 معرفی و قابلیت‌ها

**206 Garage OS** یک دفتر وقایع خودرو با رابط فارسی، گزارش‌گیری و مدیریت سوابق از راه دور است. رویدادها از طریق ربات تلگرام یا API مجاز ثبت می‌شوند؛ Cloudflare Worker داده را اعتبارسنجی می‌کند و در مخزن GitHub می‌نویسد؛ داشبورد GitHub Pages فایل‌های ثبت‌شده را می‌خواند و آن‌ها را به آمار و نمودار تبدیل می‌کند.

### قابلیت‌های اصلی

- 🚘 **دفتر وقایع خودرو:** کیلومترشمار، مسافت، سوخت‌گیری، سرویس، قطعه، کارواش، هزینه، جریمه، خرابی، تعمیر و یادداشت.
- 👥 **ثبت شخص انجام‌دهنده:** اگر نامی مشخص نشود، پیش‌فرض «من» است؛ می‌توان راننده یا فرد پرداخت‌کننده را با نامی مانند «بابام» یا «مادرم» ثبت کرد.
- 🧮 **نسبت دادن مسافت:** اختلاف بین دو ثبت معتبر کیلومترشمار به شخص ثبت‌کنندهٔ کیلومتر جدید نسبت داده می‌شود. این تخمین مبتنی بر دو قرائت است، نه GPS.
- 📝 **توضیح مستقل:** شرح اصلی رویداد و توضیح تکمیلی جدا از هم نگهداری می‌شوند.
- ✏️ **مدیریت رویداد:** مشاهدهٔ جزئیات، ویرایش، تغییر شخص، افزودن توضیح، حذف با تأیید و بازگردانی از بایگانی.
- ⛽ **تحلیل سوخت:** مقدار لیتر، هزینه، قیمت متوسط لیتر و تخمین مصرف در صورت وجود دادهٔ کافی و ثبت‌های باک کامل.
- 🧰 **نگهداری خودرو:** بازهٔ زمانی و کیلومتری برای سرویس‌ها و محاسبهٔ موعد تقریبی.
- 🚦 **دفتر جریمه:** نمایش مجموع جریمه‌ها، پرداخت‌شده‌ها و پرداخت‌نشده‌ها به‌صورت مجزا.
- 📊 **داشبورد تحلیلی:** بازه‌های ساعتی، روزانه، هفتگی و ماهانه، هزینه‌ها، سوخت، مسافت، سهم اشخاص و هزینهٔ هر کیلومتر.
- 🖼️ **تحلیل تصویری تلگرام:** `/analysis hour|day|week|month` گزارش متنی و نمودارهای PNG هزینه، سوخت و مسافت را ارسال می‌کند.
- 📦 **خروجی و پشتیبان:** CSV همهٔ رویدادها یا یک ماه و فایل JSON برای پشتیبان‌گیری.
- 🔐 **حفاظت از API:** توکن API فقط در Cloudflare Worker Secret می‌ماند؛ در HTML یا داشبورد عمومی قرار نمی‌گیرد.
- ⚡ **بدون Cron برای ثبت عادی:** ثبت، ویرایش، گزارش و خروجی هنگام دریافت درخواست انجام می‌شوند؛ ارسال خودکار دوره‌ای به یک زمان‌بند جداگانه نیاز دارد.

## 🔁 سامانه چگونه کار می‌کند؟

```mermaid
flowchart LR
    T[Telegram Bot] --> W[Cloudflare Worker]
    A[Authorized API Client] --> W
    W -->|validate and process| G[GitHub Contents API]
    G --> D[data/logs/YYYY-MM.json]
    G --> I[data/index.json]
    D --> P[GitHub Pages Dashboard]
    I --> P
```

- **تلگرام:** [@Peugeot206GarageBot](https://t.me/Peugeot206GarageBot)
- **داشبورد:** [mehrdadmb2.github.io/peugeot-206-garage](https://mehrdadmb2.github.io/peugeot-206-garage/)
- **Worker health:** [بررسی وضعیت Worker](https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health)
- **مخزن:** [GitHub Repository](https://github.com/mehrdadmb2/peugeot-206-garage)

## ⚡ شروع سریع

1. داشبورد را باز کن و از ربات `/start` و سپس `/guide` را بفرست.
2. یک کیلومتر واقعی ثبت کن، مثلاً `/km 431381`، یا پیام طبیعی «بابام کیلومتر ۴۳۱۳۸۱» را بنویس.
3. ثبت عادی مثل «۲۰ لیتر بنزین، هزینه ۷۰۰ هزار تومان، کیلومتر ۴۳۱۴۰۰، توضیح: سفر» را ارسال کن.
4. برای گزارش تصویری، `/analysis month` را بفرست؛ برای فهرست سوابق، `/operations all` را ارسال کن.
5. بعد از هر ثبت مهم، شناسهٔ رویداد و پاسخ تأیید ربات را بررسی کن.

## 📚 تمام فرمان‌های ربات

فهرست زیر با فرمان‌های canonical در `worker/src/index.js` هماهنگ است. برای راهنمای کامل چندبخشی داخل تلگرام از `/guide` استفاده کن. فرمان‌های منو باید انگلیسی و با حروف کوچک باشند؛ توضیحات فارسی صرفاً شرح عملکردند.

| فرمان | کاربرد | نمونه |
|---|---|---|
| `/start` | 🚘 شروع و نمایش پیام آغازین | `/start` |
| `/help` | 📖 راهنمای سریع فرمان‌ها | `/help` |
| `/guide` | 📚 دفترچهٔ کامل فارسی و نمونه‌ها | `/guide` |
| `/analysis` | 📈 تحلیل متنی و نمودارهای PNG | `/analysis week` |
| `/purchasekm` | 🛒 نمایش/تنظیم کیلومتر خرید و برآورد پیمایش | `/purchasekm 428000 estimate=2400` |
| `/id` | 🆔 نمایش شناسهٔ عددی تلگرام و گفتگو | `/id` |
| `/km` | ⌁ ثبت کیلومترشمار فعلی | `/km 431381` |
| `/trip` | 🚗 ثبت مسافت طی‌شده | `/trip 85` |
| `/fuel` | ⛽ ثبت سوخت، هزینه، کیلومتر و باک کامل | `/fuel 20l cost=700000 toman km=431400 full` |
| `/service` | 🔧 ثبت سرویس خودرو | `/service oil cost=900000 toman km=431400` |
| `/part` | 🧩 ثبت قطعه یا قطعهٔ مصرفی | `/part air_filter km=431400` |
| `/interval` | ⚙️ تنظیم بازهٔ سرویس به کیلومتر/روز | `/interval engine_oil 5000 180` |
| `/due` | ⏰ سرویس‌های نزدیک موعد یا عقب‌افتاده | `/due` |
| `/summary` | 📊 گزارش هزینه، سوخت، کارکرد و رویدادها | `/summary week` |
| `/config` | 🛠 نمایش تنظیمات خودرو و سرویس‌ها | `/config` |
| `/fine` | 🚦 ثبت یک جریمه | `/fine 500000 toman speeding` |
| `/fines` | 🧾 مجموع و فهرست جریمه‌ها، پرداختی و بدهی | `/fines` |
| `/paid` | ✅ ثبت پرداخت جریمه با شناسه | `/paid a1b2c3d4` |
| `/wash` | 🧽 ثبت کارواش و هزینهٔ آن | `/wash 180000 toman` |
| `/repair` | 🛠 ثبت تعمیر یا رفع خرابی باز | `/repair suspension cost=450000 toman` |
| `/expense` | 💳 ثبت هزینهٔ متفرقه خودرو | `/expense 250000 toman parking` |
| `/note` | 📝 ثبت یادداشت خودرو | `/note inspect tires next visit` |
| `/latest` | 🧾 نمایش آخرین رویدادها | `/latest` |
| `/fuelstats` | ⛽ گزارش مصرف و هزینهٔ سوخت | `/fuelstats` |
| `/detail` | 🔎 مشاهدهٔ جزئیات رویداد و دکمه‌های مدیریت | `/detail a1b2c3d4` |
| `/edit` | ✏️ ویرایش فیلدهای پشتیبانی‌شده | `/edit a1b2c3d4 شخص=بابام \| توضیح=سفر` |
| `/annotate` | 🗒 افزودن/اصلاح توضیح تکمیلی | `/annotate a1b2c3d4 سفر خانوادگی` |
| `/actor` | 👤 تغییر شخص انجام‌دهنده | `/actor a1b2c3d4 مادرم` |
| `/delete` | 🗑 درخواست حذف با تأیید نهایی | `/delete a1b2c3d4` |
| `/restore` | ♻️ بازگردانی رویداد از بایگانی | `/restore a1b2c3d4` |
| `/operations` | 🗂 نمایش عملیات با شناسه و دکمه‌های مدیریت | `/operations all` |
| `/export` | 📥 فایل CSV برای همه یا یک ماه | `/export all` یا `/export 2026-10` |
| `/backup` | 🛡️ فایل پشتیبان JSON برای همه یا یک ماه | `/backup` یا `/backup 2026-10` |
| `/people` | 👥 افزودن/فهرست اشخاص | `/people add محمد` |
| `/cancel` | ↩️ خروج از روند مدیریت/تأیید جاری | `/cancel` |
| `/undo` | ↩️ نمایش راهنمای بازگردانی و حذف امن | `/undo` |

### 👥 افراد، راننده و توضیح تکمیلی

بدون تعیین شخص، رویداد به نام «من» ثبت می‌شود. برای نام دلخواه ابتدا از `/people add NAME` استفاده کن.

```text
بابام کیلومتر 431381
بابام 20 لیتر بنزین زد؛ هزینه 700000 تومان؛ توضیح: سفر خانوادگی
مادرم: کارواش 180000 تومان
/people add محمد
/actor a1b2c3d4 محمد
/annotate a1b2c3d4 تعویض روغن قبل از سفر
```

**تفسیر مسافت:** اگر کیلومتر قبلی 431247 و ثبت جدید به نام «بابام» 431381 باشد، 134 کیلومتر به سهم رانندگی بابام نسبت داده می‌شود. این محاسبه بر اساس قرائت‌های کیلومترشمار است و فرض نمی‌کند مسیر یا لحظهٔ دقیق رانندگی از GPS معلوم است.

### 📈 بازه‌های تحلیل

| دستور | بازه |
|---|---|
| `/analysis hour` | ۲۴ ساعت اخیر، گروه‌بندی ساعتی |
| `/analysis day` | ۳۰ روز اخیر، روز به روز |
| `/analysis week` | ۱۲ هفتهٔ اخیر |
| `/analysis month` | ۱۲ ماه اخیر |

گزارش تلگرام حاوی خلاصه و نمودارهای تصویری هزینه، مقدار سوخت و مسافت است. اگر سرویس بیرونی تولید تصویر در دسترس نباشد، ربات باید گزارش متنی یا خطای قابل‌فهم برگرداند؛ موفقیت نهایی به تنظیمات و شبکهٔ سرویس تولید نمودار وابسته است.

### 🧾 توضیح جریمه‌ها

`/fines` مجموع جریمه‌های ثبت‌شده را به تفکیک پرداخت‌شده و پرداخت‌نشده نشان می‌دهد. بدهی پرداخت‌نشده نباید به‌عنوان هزینهٔ پرداخت‌شده در تحلیل هزینه‌ها محاسبه شود. برای ثبت جریمه:

```text
/fine 500000 toman speeding km=431400
/paid a1b2c3d4
/fines
```

## 🛒 مبنای کیلومتر خرید

مقدار مبنای فعلی `428000 km` و برآورد پیمایش از خرید `2400 km` است. در snapshot اولیه، آخرین کیلومتر ثبت‌شده `431381 km` بود:

- اختلاف کیلومتر ثبت‌شده با مبنای خرید: **3,381 km**.
- اختلاف این مقدار با برآورد تقریبی 2,400 کیلومتر: **981 km**.

این اختلاف به شکل هشدار/تطبیق نمایش داده می‌شود؛ سیستم نباید کیلومتر واقعی خودرو را صرفاً برای هماهنگ کردن آن با یک برآورد تغییر دهد. اگر عدد روی کیلومترشمار با مقدار ذخیره‌شده فرق دارد، تنها پس از خواندن کیلومتر واقعی آن را اصلاح کن.

```text
/purchasekm
/purchasekm 428000 estimate=2400
```

اگر تاریخ خرید دقیق معلوم نیست، برای پیمایش تاریخی زمان ساختگی ایجاد نمی‌شود. فاصلهٔ کیلومتر خرید تا اولین قرائت معتبر می‌تواند در مجموع از زمان خرید حساب شود، اما به ساعت یا روز نامعلوم نسبت داده نمی‌شود.

## 🤖 راهنمای BotFather

برای ثبت منوی command در تلگرام:

1. به [@BotFather](https://t.me/BotFather) برو.
2. دستور `/setcommands` را بفرست و `@Peugeot206GarageBot` را انتخاب کن.
3. تمام محتوای فایل [`botfather-commands.txt`](botfather-commands.txt) را یک‌جا ارسال کن.
4. پس از ذخیره، به ربات برگرد و `/start` و `/guide` را آزمایش کن.

**توجه:** BotFather فقط منو را تعریف می‌کند؛ رفتار هر فرمان باید در Worker مستقرشده هم وجود داشته باشد. فهرست این مخزن شامل ۳۶ فرمان استاندارد است و با handlerهای فرمان در سورس نسخهٔ 3.2 تطبیق داده شده است.

## 🌐 نصب و انتشار GitHub Pages

1. فایل‌های سایت را در ریشهٔ مخزن قرار بده؛ `index.html` باید در ریشه باشد.
2. در GitHub مسیر **Settings → Pages** را باز کن.
3. گزینهٔ **Deploy from a branch**، شاخهٔ `main` و پوشهٔ `/(root)` را انتخاب کن.
4. پس از تکمیل deployment این آدرس را باز کن: [داشبورد زنده](https://mehrdadmb2.github.io/peugeot-206-garage/).
5. اگر صفحه قدیمی بود، `Ctrl+F5` بزن و در Actions وضعیت deployment را بررسی کن.

### ⚠️ هنگام ارتقا این داده‌ها را حفظ کن

```text
data/config.json
data/index.json
data/logs/YYYY-MM.json
data/deleted-events.json  # اگر وجود دارد
```

این فایل‌ها مبنای آمار، تنظیمات خودرو و تاریخچهٔ عملیاتی‌اند. بستهٔ امن ارتقا عمداً آن‌ها را شامل نمی‌کند تا هنگام استخراج، اطلاعات زنده جایگزین نشوند.

## ☁️ تنظیم Cloudflare Worker

نیازمندی‌ها: Node.js LTS، npm، حساب Cloudflare و دسترسی نوشتن به مخزن GitHub.

از پوشهٔ پروژه:

```powershell
cd .\worker
npm install
npm test
npm run check
npx wrangler login
```

### Secretهای موردنیاز

| نام Secret | کاربرد |
|---|---|
| `GITHUB_TOKEN` | توکن محدود GitHub با دسترسی `Contents: Read and write` فقط به مخزن لازم |
| `TELEGRAM_BOT_TOKEN` | توکن دریافتی از BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | رشتهٔ تصادفی برای بررسی درخواست‌های وب‌هوک |
| `ALLOWED_TELEGRAM_USER_ID` | شناسهٔ عددی حساب تلگرام مجاز؛ نام کاربری کافی نیست |
| `API_ACCESS_TOKEN` | توکن مجزا و قوی برای API خارجی |

مقادیر را در Cloudflare ثبت کن؛ هرگز آن‌ها را در `index.html`، فایل‌های JSON عمومی، README یا commit قرار نده.

```powershell
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_TELEGRAM_USER_ID
npx wrangler secret put API_ACCESS_TOKEN
npx wrangler deploy
```

ساخت یک secret تصادفی در PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

این دستور را برای `TELEGRAM_WEBHOOK_SECRET` و `API_ACCESS_TOKEN` جداگانه اجرا کن تا دو مقدار متفاوت داشته باشی.

بررسی وضعیت Worker:

```powershell
Invoke-RestMethod "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health" | ConvertTo-Json -Depth 6
```

## 🔗 ثبت وب‌هوک تلگرام

وب‌هوک باید به URL زیر اشاره کند و برای دکمه‌های inline، `callback_query` در `allowed_updates` فعال باشد:

`https://peugeot-206-garage-bot.game-developer-mb.workers.dev/telegram`

برای نصب در PowerShell بدون ساخت فایل اسکریپت، از این الگو استفاده کن. توکن و secret را هنگام prompt وارد کن؛ آن‌ها را برای هیچ‌کس ارسال نکن.

```powershell
$tokenSecure = Read-Host "BotFather bot token" -AsSecureString
$BOT_TOKEN = [System.Net.NetworkCredential]::new("", $tokenSecure).Password
$secretSecure = Read-Host "Exact TELEGRAM_WEBHOOK_SECRET from Cloudflare" -AsSecureString
$WEBHOOK_SECRET = [System.Net.NetworkCredential]::new("", $secretSecure).Password
$WORKER_URL = "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/telegram"

$payload = @{
  url = $WORKER_URL
  secret_token = $WEBHOOK_SECRET
  allowed_updates = @("message", "callback_query")
  drop_pending_updates = $false
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
  -Uri ("https://api.telegram.org/bot{0}/setWebhook" -f $BOT_TOKEN) `
  -ContentType "application/json; charset=utf-8" -Body $payload | ConvertTo-Json -Depth 5
```

برای مشاهدهٔ وضعیت وب‌هوک:

```powershell
Invoke-RestMethod -Uri ("https://api.telegram.org/bot{0}/getWebhookInfo" -f $BOT_TOKEN) | ConvertTo-Json -Depth 6
```

## 🔌 API

همهٔ مسیرهای `/api/v1/*` به هدر احراز هویت نیاز دارند:

```http
Authorization: Bearer YOUR_API_ACCESS_TOKEN
```

| Method | Route | توضیح |
|---|---|---|
| `GET` | `/health` | وضعیت و وجود تنظیمات Worker؛ عمومی |
| `GET` | `/` یا `/api` | معرفی API و مسیرها |
| `POST` | `/telegram` | وب‌هوک خصوصی تلگرام |
| `GET` | `/api/v1/overview` | شاخص‌های جمع‌بندی |
| `GET` | `/api/v1/events?month=2026-10&type=fuel&limit=100` | فهرست رویدادهای فیلترشده |
| `GET` | `/api/v1/due` | موعد سرویس‌ها |
| `GET` | `/api/v1/config` | تنظیمات خودرو و سرویس‌ها |
| `GET` | `/api/v1/export?month=2026-10` | خروجی CSV |
| `POST` | `/api/v1/record` | ثبت متن طبیعی یا رویداد ساختاریافته |
| `POST` | `/api/v1/event/update` | ویرایش رویداد مجاز |
| `DELETE` | `/api/v1/event?id=EVENT_ID` | بایگانی و حذف رویداد |

نمونهٔ درخواست PowerShell:

```powershell
$apiSecure = Read-Host "API_ACCESS_TOKEN" -AsSecureString
$API_TOKEN = [System.Net.NetworkCredential]::new("", $apiSecure).Password
$body = @{ text = "20l fuel, cost 700000 toman, km 431400 full" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "https://peugeot-206-garage-bot.game-developer-mb.workers.dev/api/v1/record" `
  -Headers @{ Authorization = "Bearer $API_TOKEN" } `
  -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
```

## 🗃️ ساختار فایل‌ها و داده‌ها

| مسیر | کاربرد |
|---|---|
| `index.html` | پوستهٔ داشبورد Pages |
| `assets/css/style.css` | طراحی واکنش‌گرا، افکت‌ها و انیمیشن |
| `assets/js/app.js` | بارگیری، تحلیل، نمودار، فیلتر و خروجی |
| `assets/img/206-white.svg` | تصویر برداری خودروی ۲۰۶ SD |
| `assets/img/favicon.svg` | آیکن اختصاصی پروژه |
| `assets/img/206-sd-garage.webp` | تصویر بنر/فضای گاراژ |
| `data/config.json` | مشخصات خودرو و بازه‌های سرویس |
| `data/index.json` | فهرست ماه‌های دارای رویداد |
| `data/logs/YYYY-MM.json` | رویدادهای هر ماه |
| `data/deleted-events.json` | بایگانی حذف‌ها؛ در صورت ایجاد |
| `worker/src/index.js` | وب‌هوک، مدیریت رویداد، API، گزارش و GitHub write |
| `worker/wrangler.toml` | نام Worker و شناسهٔ مخزن/شاخه |
| `worker/tests/worker.test.mjs` | آزمون مسیرها، امنیت و رفتارهای کلیدی |
| `botfather-commands.txt` | فهرست آمادهٔ منوی فرمان BotFather |

### مدل داده و واحدها

- زمان‌ها با منطقهٔ `Asia/Tehran` مدیریت می‌شوند؛ تاریخ میلادی برای کلید ماه و برچسب شمسی برای نمایش استفاده می‌شود.
- هزینه‌ها با عدد صحیح ریال در `costRial` ذخیره و به تومان نمایش داده می‌شوند (هر تومان = ۱۰ ریال).
- `occurredAt` زمان رخداد و `createdAt` زمان ایجاد ثبت است.
- مقدار مسافت بر اساس کیلومترشمار فقط هنگامی قابل اتکاست که دو قرائت معتبر و ترتیب زمانی درست داشته باشیم.
- فاصله‌های سرویس پیش‌فرض و قابل تنظیم‌اند؛ دفترچهٔ دقیق خودرو و نظر تعمیرکار مرجع نهایی است.

## 🔐 امنیت و حریم خصوصی

- ربات با `ALLOWED_TELEGRAM_USER_ID` محدود می‌شود؛ این مقدار باید شناسهٔ عددی کاربر مورد اعتماد باشد.
- توکن‌ها و secretها را فقط در Cloudflare Worker Secrets یا محیط محلی نگهداری کن.
- اگر مخزن عمومی است، تمام فایل‌های ثبت‌شدهٔ داخل `data/` برای عموم قابل خواندن هستند. برای سوابق شخصی، مخزن خصوصی را ترجیح بده و قابلیت Pages و برنامهٔ اشتراک‌گذاری سازمان/حساب را با تنظیمات فعلی خود بررسی کن.
- `API_ACCESS_TOKEN` نباید به کد سمت مرورگر یا مخزن GitHub اضافه شود.
- نوشتن هم‌زمان ممکن است به تعارض GitHub Contents API یا محدودیت نرخ برخورد کند؛ بعد از خطا، قبل از تکرار ثبت، مخزن را بررسی کن تا رکورد تکراری ایجاد نشود.
- نسخهٔ پشتیبان را جدا از همان مخزن نگه دار؛ پشتیبان تنها در همان شاخه یا مخزن، محافظت مستقل محسوب نمی‌شود.

## 🧪 آزمایش و عیب‌یابی

از پوشهٔ `worker/` اجرا کن:

```powershell
npm install
npm test
npm run check
```

تست محلی، رفتار کد با درخواست‌های آزمایشی را بررسی می‌کند؛ معتبر بودن secretهای واقعی، مجوز GitHub، کارکرد واقعی وب‌هوک و دسترس‌پذیری سرویس خارجی نمودار را تضمین نمی‌کند.

| مشکل | بررسی پیشنهادی |
|---|---|
| ربات پاسخی نمی‌دهد | `getWebhookInfo`، شناسهٔ مجاز، secret وب‌هوک و Worker Logs را بررسی کن. |
| وب‌هوک 403 می‌دهد | مقدار `TELEGRAM_WEBHOOK_SECRET` باید دقیقاً با `secret_token` وب‌هوک تطبیق کند. |
| ثبت در GitHub انجام نمی‌شود | انقضای توکن، مجوز Contents و شاخهٔ `main` را بررسی کن. |
| داشبورد داده نمی‌خواند | انتشار Pages و دسترسی به `data/index.json` و `data/config.json` را بررسی کن. |
| نمودار تصویر نمی‌آید | گزارش متنی را بررسی کن؛ برای PNG لازم است دسترسی سرویس تصویر و پاسخ API آن فعال باشد. |
| عدد پیمایش اختلاف دارد | کیلومتر واقعی خودرو را کنترل کن؛ برآورد تقریبی دلیل کافی برای تغییر قرائت واقعی نیست. |
| تغییر روی سایت دیده نمی‌شود | وضعیت GitHub Actions/Pages را بررسی و سپس `Ctrl+F5` اجرا کن. |

## 📎 لینک‌های رسمی پروژه

- 🌐 [داشبورد خودرو](https://mehrdadmb2.github.io/peugeot-206-garage/)
- 🤖 [ربات تلگرام](https://t.me/Peugeot206GarageBot)
- 🧰 [وضعیت Worker](https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health)
- 💻 [مخزن GitHub](https://github.com/mehrdadmb2/peugeot-206-garage)
- 📘 [Telegram Bot API](https://core.telegram.org/bots/api)
- ☁️ [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- 🗂️ [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)

## 🧾 نسخه و مجوز

- نسخهٔ مستندات: **3.2.0**
- مجوز: [MIT](LICENSE)
- هر گونه فاصلهٔ سرویس، سابقهٔ مالی یا کیلومتر باید مطابق اطلاعات واقعی خودرو اصلاح شود؛ این نرم‌افزار جایگزین بررسی فنی یا دفترچهٔ سازنده نیست.

<div align="center">
  <strong>🚘 206 Garage OS</strong><br>
  <sub>هر کیلومتر، هر هزینه و هر سرویس؛ مرتب، قابل پیگیری و قابل تحلیل.</sub><br><br>
  <a href="https://mehrdadmb2.github.io/peugeot-206-garage/">🌐 باز کردن داشبورد</a> ·
  <a href="https://t.me/Peugeot206GarageBot">✈️ باز کردن ربات</a>
</div>
