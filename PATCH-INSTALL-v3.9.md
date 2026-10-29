# نصب Garage OS v3.9.0

## 1. قبل از شروع

- از پوشهٔ `data/` و مخزن GitHub پشتیبان بگیر.
- بستهٔ امن را روی ریشهٔ پروژه استخراج کن؛ فایل‌های `data/logs/` را از snapshot کامل جایگزین نکن.

## 2. پاک‌سازی امن فیلد تخمینی قدیمی

از ریشهٔ پروژه اجرا کن:

```powershell
node .\scripts\upgrade-config-v3.9.mjs
```

این اسکریپت فقط فیلدهای تخمینی قدیمی را در `data/config.json` حذف می‌کند، ابتدا یک پشتیبان timestamp دار می‌سازد و فایل‌های رویداد و کیلومترشمار را تغییر نمی‌دهد. اگر از قبل پاک شده باشند، فایل را بی‌تغییر می‌گذارد.

## 3. تست و انتشار Worker

```powershell
cd .\worker
npm install
npm test
npm run check
npx wrangler deploy
```

## 4. فعال‌سازی یادآورهای خودکار

در پوشهٔ Worker اجرا کن:

```powershell
npx wrangler secret put SCHEDULE_TRIGGER_SECRET
```

یک secret تصادفی با حداقل 32 کاراکتر وارد کن. همان مقدار را در GitHub repository secret با نام `SCHEDULE_TRIGGER_SECRET` ثبت کن: **Settings → Secrets and variables → Actions**.

فایل `.github/workflows/maintenance-reminders.yml` روزانه نزدیک 09:00 تهران Worker را در endpoint امن `/scheduled/reminders` صدا می‌زند. اجرای دستی هم از زبانهٔ Actions ممکن است. secret را هرگز در فایل‌های repository ننویس.

## 5. انتشار داشبورد و workflow

به ریشهٔ مخزن برگرد، ابتدا `git status` را بررسی کن تا مطمئن شوی فایل‌های `data/` ناخواسته برای جایگزینی آماده نشده‌اند. سپس کد، سایت، مستندات و workflow را commit و push کن:

```powershell
cd ..
git status
git add .github/workflows/maintenance-reminders.yml index.html site.webmanifest assets worker scripts/upgrade-config-v3.9.mjs README.md CHANGELOG-v3.9.md PATCH-INSTALL-v3.9.md FIXES-v3.9.md botfather-commands.txt
git commit -m "Upgrade Garage OS to v3.9"
git push origin main
```

اگر در خروجی `git status` فایل‌های `data/config.json` یا `data/logs/` برای جایگزینی ناخواسته دیده می‌شوند، آن‌ها را به این commit اضافه نکن. پس از push، GitHub Pages و workflow به‌روزرسانی می‌شوند.

گزارش آزمون‌های محلی: [`TEST-RESULTS-v3.9.txt`](TEST-RESULTS-v3.9.txt).

## سیاست هشدار

- `upcoming`: نزدیک موعد
- `due`: موعد رسیده
- `overdue`: از موعد گذشته
- `critical`: عبور قابل‌توجه از بازه

در یک چرخه، هشدار هنگام ورود به مرحله و هنگام ارتقا به مرحلهٔ شدیدتر فرستاده می‌شود؛ در همان مرحله هر روز تکرار نمی‌شود. با ثبت یک سرویس جدید، چرخهٔ نگهداری جدید آغاز می‌شود.

## بررسی نهایی

- `npm test` باید همهٔ آزمون‌ها را پاس کند.
- `GET /health` باید نسخهٔ 3.9.0 را گزارش کند.
- `POST /scheduled/reminders` بدون secret باید 403 برگرداند.
- فرمان `/issues` خرابی‌های باز را با دکمه‌های «جزئیات» و «بستن خرابی» نشان می‌دهد.
