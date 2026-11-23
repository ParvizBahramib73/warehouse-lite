# انتشار Warehouse Lite روی GitHub Pages

## مخزن پیشنهادی

- Owner: `ParvizBahramib73`
- Repository: `warehouse-lite`
- Visibility: Public (کد برنامه عمومی است؛ هیچ داده واقعی مشتری یا کسب‌وکار نباید در مخزن قرار بگیرد)
- Default branch: `master`
- URL مورد انتظار: `https://parvizbahramib73.github.io/warehouse-lite/`

## راه‌اندازی یک‌باره

1. سورس پروژه در ریشه مخزن `ParvizBahramib73/warehouse-lite` ثبت شده است؛ ZIP را به‌جای فایل‌های پروژه commit نکنید.
2. در Settings → Pages → Build and deployment، Source را روی **GitHub Actions** قرار دهید.
3. شاخه پیش‌فرض این مخزن `master` است؛ هر دو Workflow روی `master` تنظیم شده‌اند. Workflow کیفیت تست‌ها را اجرا می‌کند و Workflow انتشار، خروجی `dist/` را به GitHub Pages می‌فرستد.
4. در Actions منتظر موفقیت `Deploy Warehouse Lite to GitHub Pages` بمانید و سپس URL خروجی را باز کنید.

## بررسی پس از انتشار

- صفحه اصلی باید در مسیر `/warehouse-lite/` باز شود.
- Manifest باید از `/warehouse-lite/manifest.webmanifest` بارگیری شود.
- Service worker باید در محدوده `/warehouse-lite/` ثبت شود.
- آیکون‌ها، CSS و ماژول‌های JS باید بدون 404 بارگیری شوند.
- پس از یک بار بارگیری کامل آنلاین، حالت هواپیما را فعال کنید و بازشدن برنامه را بررسی کنید.
- فقط داده ساختگی وارد کنید؛ خروجی رمزگذاری‌شده را دانلود و در مرورگر آزمایشی دیگری بازیابی کنید.

## داده و امنیت

- هیچ اطلاعات واقعی مشتری/تأمین‌کننده/فاکتور/پرداخت و هیچ فایل `.wlbackup` را commit نکنید.
- GitHub Pages دیتابیس نیست و فقط فایل‌های ثابت برنامه را میزبانی می‌کند.
- برنامه فعلاً تک‌دستگاهی است؛ همگام‌سازی بین گوشی و تبلت وجود ندارد.
- تا زمانی که آزمون دستی بازیابی و بررسی امنیتی روی Android انجام نشده، از آن برای حسابداری واقعی استفاده نکنید.
