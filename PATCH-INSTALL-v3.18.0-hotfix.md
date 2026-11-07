# Peugeot 206 Garage — CI Hotfix برای v3.18.0

## علت خطا

Workflow ساخت داشبورد پس از تولید Snapshot، تست‌های رگرسیون را اجرا می‌کرد. تست رندر داشبورد چند مقدار کیلومتر ثابت (مربوط به Snapshot قدیمی) داشت. با ثبت کیلومتر جدید، دادهٔ واقعی تغییر می‌کرد اما تست همچنان مقدار قبلی را انتظار داشت؛ در نتیجه Workflow پیش از مرحلهٔ انتشار Snapshot متوقف می‌شد.

## اصلاحات

1. مقدار «پیمایش از خرید» از `currentOdometerKm - purchaseOdometerKm` در Snapshot محاسبه و با خروجی رابط مقایسه می‌شود.
2. فاصله از آخرین تعویض قطعه از کیلومتر فعلی و کیلومتر واقعی آخرین رویداد تعویض استخراج می‌شود.
3. سه مقدار «مانده تا سرویس» برای روغن موتور، فیلتر هوا و شمع‌ها با توجه به آخرین رویداد معتبر و فاصلهٔ سرویس محاسبه می‌شوند؛ دیگر عدد قدیمی هاردکد نشده است.
4. Workflow ساخت داشبورد با تغییر تست‌های `worker/tests/**` و `worker/test/**` نیز اجرا می‌شود.
5. Snapshot فعلی از روی ۴۵ رویداد خام دوباره تولید شده است.

## نصب Patch

ZIP را در ریشهٔ ریپوی GitHub استخراج کن و فایل‌ها را با حفظ مسیر پوشه‌ها جایگزین کن. سپس هر سه فایل/مسیر زیر را Commit و Push کن:

- `.github/workflows/build-dashboard.yml`
- `worker/tests/dashboard-render-smoke.test.mjs`
- `data/dashboard.json`

پس از Push، دو Workflow مربوط به Verify و Build Dashboard باید اجرا شوند. Build Dashboard در صورت موفقیت، Snapshot را از داده‌های خام دوباره تولید و در صورت نیاز روی `main` Commit می‌کند.

## Cloudflare Worker

کد `worker/src/index.js` و تنظیمات Worker در این Hotfix تغییر نکرده‌اند؛ بنابراین برای این اصلاح نیازی به Deploy مجدد Cloudflare Worker نیست. Secretها، KV و `wrangler.toml` را تغییر نده.

## آزمون

- `npm run check --prefix worker` — موفق
- `npm test --prefix worker` — ۸۹ تست موفق، صفر ناموفق
- `node worker/test/smoke.mjs` — موفق
- ساخت Snapshot — ۴۵ رویداد، ۶۲ قلم کاتالوگ، کیلومتر فعلی ۴۳۱٬۹۰۳
