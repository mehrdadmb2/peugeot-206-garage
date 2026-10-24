# نصب و ارتقای Peugeot 206 Garage OS v3.3.0

## کدام بسته را انتخاب کنم؟
- `peugeot-206-garage-v3.3-safe-patch.zip`: پیشنهادشده برای نصب روی مخزن فعلی؛ فایل‌های لاگ، شاخص داده و تنظیمات زنده را جایگزین نمی‌کند.
- `peugeot-206-garage-v3.3-full-project.zip`: snapshot کامل از فایل‌ها و داده‌های موجود در زمان بسته‌بندی است. اگر از زمان snapshot رویداد جدید ذخیره کرده‌ای، این بسته ممکن است قدیمی باشد و نباید روی مخزن زنده استخراج شود.

## نصب بسته امن
1. از مخزن فعلی یک نسخه پشتیبان جداگانه بگیر.
2. ZIP امن را مستقیماً روی پوشه ریشه مخزن استخراج کن؛ همان جایی که `index.html`, `assets/`, `data/` و `worker/` هستند.
3. در PowerShell در پوشه ریشه اجرا کن:

```powershell
node .\scripts\merge-config-v3.3.mjs
```

این اسکریپت در صورت نبودن فایل backup، ابتدا `data/config.pre-v3.3.json` را ایجاد می‌کند؛ سپس فقط کاتالوگ و تنظیمات سرویس جدید را با فایل فعلی ادغام می‌کند. اشخاص، مشخصات خودرو، مبنای خرید و مقادیر سفارشی موجود حفظ می‌شوند. `data/logs/` و `data/index.json` را حذف نکن.

4. تست و بررسی Worker:

```powershell
cd .\worker
npm install
npm test
npm run check
npx wrangler deploy
```

5. به ریشه پروژه برگرد، تغییرات را بررسی و سپس commit/push کن:

```powershell
cd ..
git status
git add index.html assets data/config.json data/config-v3.3-template.json scripts worker/src/index.js worker/package.json worker/tests README.md CHANGELOG-v3.3.md PATCH-INSTALL-v3.3.md botfather-commands.txt REPAIRJOB-PROMPT.txt
git commit -m "Upgrade 206 Garage OS to v3.3"
git push origin main
```

6. در [@BotFather](https://t.me/BotFather) از `/setcommands` استفاده کن و محتوای `botfather-commands.txt` را یک‌جا وارد کن. برای دکمه‌های inline، وب‌هوک باید `callback_query` را در `allowed_updates` بپذیرد.

## نمونه ثبت تعمیرگاه
فایل `REPAIRJOB-PROMPT.txt` را مرور کن و متن آن را پس از تأیید جزئیات، در چت خصوصی ربات بفرست. این پرامپت در خروجی‌های بسته است اما خودش به‌عنوان رویداد در داده‌های خودرو وارد نشده است. اگر مبلغ اجرت یا برند نامعلوم است، خالی/نامشخص بگذار تا سامانه عدد ساختگی نسازد.

## جریمه و موعدها
- از `/fine` برای ثبت قبض و تاریخ، از `/fineinfo ID` برای جزئیات و از `/paid ID date=YYYY/MM/DD amount=... تومان ref=...` برای ثبت پرداخت استفاده کن.
- محاسبه گذشت روز و مهلت در برنامه تنها یادآوری است؛ مبلغ قطعی، وضعیت اعتراض و هر افزایش قانونی را در سامانه رسمی راهور/مرجع صدور قبض بررسی کن.

## وضعیت انتشار
بسته محلی است و به‌تنهایی باعث تغییر Worker یا GitHub Pages آنلاین نمی‌شود. انتشار پس از اجرای دستورات فوق انجام می‌شود.
