# انبار من | Anbar Man — 0.2.1

Offline-first Persian warehouse / purchasing / invoicing application (PWA).

**Developed by [Parviz Bahrami | پرویز بهرامی](https://parvizbahramib73.github.io/personal-brand-website/)**.

## Live application

https://parvizbahramib73.github.io/warehouse-lite/

The previous 0.1.8 program has been replaced on the main URL **at the user's request**, because the owner confirmed there is **no real business data** in the older installation. The previous code remains recoverable from commit `ad1fe0522fb6e85d28ea052de8b274a89b4507d8`. The v0.2 preview remains available independently at `/preview/v0.2/`.

## Features

- Solar Hijri (Jalali/Iranian) calendar for purchase lots, invoice settlement and cheque dates; ISO dates stored internally for sorting and comparisons
- English numerals and 3-digit comma grouping in all monetary display/entry fields, integer **IRR/rial** storage
- User-edited replacement cost, suggested sales price (10% default markup), three inventory valuations, profit snapshots
- Purchase lots with expiry warnings, stock quantities, multiunit products, image details
- A5/A4 invoices, image sharing, fixed custody clause and settlement date
- Supplier cheques, customer payments, overdue invoices, direct dial links, search suggestions
- Submenus, themes, preferences, encrypted backup/export and validated replacement restore
- Bulk stock import from CSV/pasted rows with review before commit (not AI OCR)

## Upgrading and storage

- New root v0.2.1 uses IndexedDB name `warehouse-lite-v02-irr`, **not** the legacy v0.1.8 Toman database (`warehouse-lite-v01`) nor the `/preview/v0.2/` database (`warehouse-lite-feedback-preview-v02`). These databases are on the same origin but are deliberately separated. No legacy Toman -> Rial migration runs.
- The web manifest keeps the root app identity `./` for installed-PWA continuity; the service worker removes only its own old version cache and the legacy root shell cache, not the preview's caches.
- Old 0.1.8 backups are not importable into v0.2.1. v0.2 IRR backup format can be restored with validation and explicit user confirmation; however a live second-device restore test remains **NOT RUN**.
- Data lives on **one device/browser** with no backend/synchronization. Export encrypted backups regularly and keep copies off the device.

## Verification and limitations

Run `npm test` (Node.js 22) and `npm run build` for the static bundle. Real Android, full browser E2E, second-device restore, inventory refunds/voids and accountant acceptance are **NOT VERIFIED**. Removal of the preview label is branding, not a claim of accounting certification. The former v0.1.8 visit-route management screen is not present in this v0.2.1 generation; it can be recovered from git history. Validate financial workflows with synthetic data before entering production records.

No real customer, invoice, supplier or business information is committed to this repository.
