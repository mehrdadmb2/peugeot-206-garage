# نصب بستهٔ اصلاحی 206 Garage OS v3.4.0

## انتخاب بسته
- `peugeot-206-garage-v3.4-safe-patch.zip`: بستهٔ پیشنهادی؛ کد و رابط کاربری را به‌روز می‌کند و `data/config.json`، `data/index.json`، `data/logs/` و سایر داده‌های زنده را جایگزین نمی‌کند.
- `peugeot-206-garage-v3.4-full-project.zip`: snapshot کامل برای نصب پاک یا محیط آزمایشی. اگر بعد از زمان تهیهٔ snapshot در GitHub ثبت جدیدی داشته‌ای، آن را روی مخزن زنده استخراج نکن.

## 1. تهیهٔ نسخهٔ پشتیبان
از مخزن و پوشهٔ `data/` نسخهٔ جدا تهیه کن. در PowerShell از ریشهٔ پروژه بررسی کن:

```powershell
git status
```

## 2. جایگزینی کد
بستهٔ امن را مستقیماً در ریشهٔ مخزن استخراج کن؛ پوشه‌ها باید در مسیرهایی مانند `index.html`، `assets/js/app.js` و `worker/src/index.js` قرار بگیرند، نه در پوشهٔ تو در تو.

## 3. تست و انتشار Worker

```powershell
cd .\worker
npm install
npm test
npm run check
npx wrangler deploy
```

نسخهٔ v3.4.0 دارای تست‌های یکپارچه برای پیام رسید اولیه، جلوگیری از ارسال مجدد `/repairjob`، تأیید/انصراف تکراری، فرمان `/duplicates` و نمایش تعویض قطعهٔ دوره‌ای در موعد سرویس است.

## 4. انتشار GitHub Pages
به ریشهٔ مخزن برگرد و تغییرات کد را ارسال کن:

```powershell
cd ..
git status
git add index.html assets/css/style.css assets/js/app.js worker/src/index.js worker/package.json worker/tests/worker.test.mjs README.md CHANGELOG-v3.4.md PATCH-INSTALL-v3.4.md botfather-commands.txt
git commit -m "Fix Telegram duplicate repair jobs and maintenance calendar"
git push origin main
```

صفحهٔ GitHub Pages پس از انتشار به‌روزرسانی می‌شود. `data/` را به صورت گروهی stage نکن مگر اینکه واقعاً قصد انتشار تغییرات همان داده‌ها را داشته باشی.

## 5. وب‌هوک تلگرام
Inline buttonها به `callback_query` وابسته‌اند. اگر `allowed_updates` را دستی تنظیم کرده‌ای، `message` و `callback_query` را نگه دار. URL وب‌هوک همچنان `https://peugeot-206-garage-bot.game-developer-mb.workers.dev/telegram` است؛ در صورت تغییر نکردن secret نیاز به ساخت وب‌هوک مجدد نیست.

## 6. تست بعد از انتشار
1. `/start` بفرست.
2. یک ثبت واقعی جدید بفرست؛ باید ابتدا پیام «دریافت شد» و سپس نتیجهٔ ثبت را ببینی.
3. همان متن `/repairjob` را دوباره بفرست؛ باید سؤال تأیید تکراری بگیرد و قبل از تأیید هیچ ردیف جدیدی نسازد.
4. `/duplicates` را اجرا کن؛ هر جفت مشکوک را بررسی کن و فقط در صورت اطمینان ادغام یا آرشیو کن.
5. یک تعویض شمع/قطعهٔ دوره‌ای ثبت‌شده را در تقویم نگهداری بررسی کن.

## 7. سوابق تکراری موجود
این نسخه تاریخچهٔ قبلی را خودکار پاک نمی‌کند. `/duplicates` فهرست جفت‌های مشکوک را ارائه می‌دهد. «ادغام» فیلدهای خالی نسخهٔ اصلی را پر و نسخهٔ دوم را به بایگانی منتقل می‌کند؛ «حذف نسخهٔ دوم» نیز بایگانی‌محور و قابل بازگردانی است. در مراجعه‌های چندبخشی، هر ردیف جداگانه کنترل می‌شود؛ قبل از انتخاب، عنوان، تاریخ، کیلومتر، شخص و مبلغ را مقایسه کن.

## توجه
- پاسخ اولیه یعنی پیام دریافت شد، نه لزوماً تمام شدن نوشتن همهٔ فایل‌ها؛ منتظر پیام نتیجهٔ نهایی بمان و متن را فوراً دوباره ارسال نکن.
- اگر پیام نتیجه نیامد، `/latest` و `/duplicates` را بررسی کن و سپس Cloudflare Worker Logs را ببین.
- تمام فایل‌های `data/` در مخزن عمومی از نظر دسترسی عمومی‌اند. اگر حساس‌اند، خصوصی بودن مخزن و شیوهٔ میزبانی Pages را بررسی کن.
