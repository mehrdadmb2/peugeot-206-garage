# نصب و جایگزینی Peugeot 206 Garage v3.10.0

این نسخه برای رفع بارگذاری کند/داشبورد خالی، انتقال محاسبات به GitHub Actions، و عیب‌یابی دقیق‌تر خطای 403 مسیر زمان‌بندی Worker آماده شده است.

## 1) چه چیزی عوض شده است؟

- داشبورد ابتدا فقط `data/dashboard.json` را می‌خواند؛ این فایل شامل تنظیمات، همهٔ رویدادها و خروجی محاسبات از پیش آماده است.
- فایل `scripts/build-dashboard.mjs` داده‌های واقعی `data/config.json`، `data/index.json` و تمام لاگ‌های `data/logs/*.json` را اعتبارسنجی و پردازش می‌کند.
- Workflow جدید `Build precomputed garage dashboard` پس از تغییر داده‌ها اجرا می‌شود، snapshot را می‌سازد و `data/dashboard.json` را commit می‌کند. یک اجرای روزانه نیز وضعیت‌های وابسته به تاریخ را تازه می‌کند.
- اگر snapshot هنوز منتشر نشده باشد، سایت موقتاً از روش قدیمی بارگذاری فایل‌ها استفاده می‌کند. اگر داده واقعاً خراب/ناقص باشد، به‌جای نمایش صفرهای گمراه‌کننده پیام خطا نشان می‌دهد.
- شناسهٔ ربات `@Peugeot206GarageBot` در هدر داشبورد به شکل یک تگ شیشه‌ای قابل کلیک قرار گرفته است.
- مسیر `/scheduled/reminders` در نبود Secret معتبر، خطای `503 schedule_secret_not_configured` و در صورت عدم تطابق دو مقدار، خطای `403 schedule_secret_mismatch` برمی‌گرداند.

## 2) جایگزینی فایل‌ها

1. از ریپوی فعلی یک نسخهٔ پشتیبان بگیر.
2. فایل ZIP جایگزینی را در ریشهٔ ریپو Extract کن و اجازه بده فایل‌های هم‌نام جایگزین شوند؛ ساختار پوشه‌ها را تغییر نده.
3. تمام فایل‌های داخل بستهٔ جایگزینی را با همان مسیرها به شاخهٔ `main` پوش کن.
4. اگر می‌خواهی کل پروژه را یک‌جا جایگزین کنی، از بستهٔ کامل استفاده کن؛ داده‌های واقعی `data/config.json` و `data/logs` نیز در بستهٔ کامل وجود دارند.

## 3) اجازهٔ نوشتن GitHub Actions

در GitHub وارد این مسیر شو:

`Repository → Settings → Actions → General → Workflow permissions`

گزینهٔ `Read and write permissions` را فعال و ذخیره کن. Workflow ساخت snapshot به `contents: write` نیاز دارد تا فقط فایل `data/dashboard.json` را commit کند.

پس از پوش‌کردن فایل‌ها:

1. وارد تب `Actions` شو.
2. Workflow با نام `Build precomputed garage dashboard` را باز کن.
3. گزینهٔ `Run workflow` را روی شاخهٔ `main` اجرا کن.
4. منتظر پایان موفق اجرای آن بمان؛ خروجی باید تعداد رویدادها و قطعات را در لاگ چاپ کند و commit جدیدی با پیام `chore: rebuild precomputed dashboard snapshot` بسازد.

پس از آن GitHub Pages باید نسخهٔ جدید `data/dashboard.json` را منتشر کند. آدرس سایت و تنظیم Source فعلی Pages را تغییر نده.

## 4) رفع 403 برای Worker

مقدار Secret در GitHub Actions و Cloudflare Worker باید **دقیقاً یکسان** و حداقل ۳۲ کاراکتر باشد. نام هر دو باید دقیقاً `SCHEDULE_TRIGGER_SECRET` باشد. این Secret با `TELEGRAM_WEBHOOK_SECRET` یا `API_ACCESS_TOKEN` فرق دارد.

### ساخت مقدار تصادفی در PowerShell ویندوز

این دستور را در PowerShell اجرا کن و خروجی را فقط نزد خودت نگه دار:

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$secret
```

### ذخیره در Cloudflare Worker

در ریشهٔ پروژه:

```powershell
cd .\worker
npx wrangler login
npx wrangler secret put SCHEDULE_TRIGGER_SECRET
```

وقتی Wrangler درخواست مقدار کرد، همان خروجی تصادفی PowerShell را Paste کن. سپس کد جدید Worker را منتشر کن:

```powershell
npx wrangler deploy
```

راه جایگزین: در داشبورد Cloudflare به Worker با نام `peugeot-206-garage-bot` برو و از `Settings → Variables and Secrets` یک متغیر از نوع **Secret** با نام `SCHEDULE_TRIGGER_SECRET` بساز یا مقدار قبلی آن را به‌روزرسانی کن.

### ذخیره همان مقدار در GitHub

به مسیر زیر برو:

`Repository → Settings → Secrets and variables → Actions → New repository secret`

نام را `SCHEDULE_TRIGGER_SECRET` بگذار و دقیقاً همان مقدار را ذخیره کن. اول و آخر مقدار نباید فاصله یا خط جدید اضافه داشته باشد.

### آزمایش

- آدرس `https://peugeot-206-garage-bot.game-developer-mb.workers.dev/health` را باز کن. باید `version: "3.10.0"` و `scheduledReminders: true` ببینی.
- در GitHub → Actions، Workflow با نام `Scheduled maintenance reminders` را دستی اجرا کن.
- اگر Worker مقدار Secret را نداشته باشد، نسخهٔ جدید با `503 schedule_secret_not_configured` گزارش می‌دهد.
- اگر دو مقدار با هم برابر نباشند، پاسخ `403` همراه `reason: "schedule_secret_mismatch"` خواهد بود. در این حالت هر دو محل را دوباره با یک مقدار واحد تنظیم کن.

## 5) بررسی محلی اختیاری

در ریشهٔ پروژه با Node.js نسخهٔ ۲۰ یا جدیدتر:

```powershell
node scripts/build-dashboard.mjs
node --check .\assets\js\app.js
node --test .\worker\tests\*.test.mjs .\scripts\*.test.mjs
node .\worker\test\smoke.mjs
```

برای انتشار مجدد Worker:

```powershell
cd .\worker
npm install
npm test
npx wrangler deploy
```

## 6) رفتار پس از نصب

- هر زمان Worker دادهٔ تازه‌ای در `data/config.json`، `data/index.json` یا `data/logs/` ثبت کند، Workflow ساخت snapshot اجرا می‌شود.
- اگر Worker چند فایل را پشت سر هم ثبت کند، Workflow قبل از پردازش آخرین نسخهٔ `main` را دوباره دریافت می‌کند تا snapshot نیمه‌کاره نسازد.
- سایت فایل آماده را با یک درخواست دریافت می‌کند؛ مرورگر دیگر لازم نیست تمام لاگ‌های ماهانه را در هر بار بازشدن جداگانه دانلود و محاسبه کند.
- Workflow روزانه هم وضعیت سرویس‌های وابسته به تاریخ را به‌روز می‌کند.
- این تغییرها هیچ Secret یا Token را داخل فایل‌های سایت یا ریپو قرار نمی‌دهند.

## 7) وضعیت تست نسخهٔ آماده‌شده

- بررسی نحوی JavaScript: موفق
- تست‌های Node: ۳۶ از ۳۶ موفق
- Worker smoke test: موفق
- ساخت snapshot از داده‌های واقعی: موفق
- دادهٔ بررسی‌شده در snapshot: ۳۱ رویداد، ۱ ماه، ۶۲ قلم قطعه، ۱۷ سرویس بازه‌ای و ۱۷ سرویس کاتالوگ
- کیلومترشمار محاسبه‌شده از رویدادهای واقعی: ۴۳۱٬۵۸۴ کیلومتر

نکته: انتشار واقعی Worker و GitHub Pages از داخل این بسته انجام نشده است. پس از جایگزینی فایل‌ها، مراحل Secrets و Deploy بالا باید در حساب‌های خودت اجرا شوند.
