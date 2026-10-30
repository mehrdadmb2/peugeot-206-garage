# راهنمای جایگزینی نسخه 3.14.0

1. کل محتوای این ZIP را جایگزین فایل‌های ریپوی `peugeot-206-garage` کن و تمام تغییرات را در شاخه `main` پوش کن.
2. Worker را از پوشه `worker` مجدداً Deploy کن؛ یا از Cloudflare Dashboard نسخه جدید `worker/src/index.js` را منتشر کن.
3. KV فعلی را نگه دار. نام Binding باید دقیقاً `GARAGE_PRIVATE_KV` باشد. این پروژه عمداً ID فضای KV را حدس نزده و در `worker/wrangler.toml` نمونه ID جعلی نگذاشته است. اگر با Wrangler Deploy می‌کنی، ID واقعی Namespace فعلی را در همان بخش کامنت‌شده قرار بده.
4. Secret فعلی `DOCUMENTS_ACCESS_TOKEN` را می‌توانی با هر رمز غیرخالی جایگزین کنی؛ حتی یک کاراکتر. رمز کوتاه امنیت بسیار پایینی دارد. برای مدارک هویتی، رمز بلند و غیرقابل حدس توصیه می‌شود.
5. Secret `VEHICLE_DOCUMENTS_JSON` و KV فعلی را پاک نکن؛ مقادیر خصوصی قبلی باید حفظ شوند. اگر داده قبلاً در KV مقداردهی شده، Seed دیگر صرفاً برای بارگذاری اولیه استفاده می‌شود.
6. پس از انتشار، `/health` را باز کن و بررسی کن `configured.privateDocuments` مقدار `true` باشد. سپس در ربات خصوصی `/documents` را بفرست. دو پیام باید دریافت شود: گزارش متنی و فایل `peugeot-206-private-documents.svg`.

## متغیرهای لازم Worker

- Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ALLOWED_TELEGRAM_USER_ID`, `GITHUB_TOKEN`, `DOCUMENTS_ACCESS_TOKEN`, `VEHICLE_DOCUMENTS_JSON` (Seed خصوصی اولیه)، `API_ACCESS_TOKEN` (در صورت استفاده از API)، `SCHEDULE_TRIGGER_SECRET` (برای یادآورها).
- KV binding: `GARAGE_PRIVATE_KV`.
- Vars: `GITHUB_OWNER=mehrdadmb2`, `GITHUB_REPO=peugeot-206-garage`, `GITHUB_BRANCH=main`.

این فایل یا ZIP هیچ Secret واقعی را شامل نمی‌شود.
