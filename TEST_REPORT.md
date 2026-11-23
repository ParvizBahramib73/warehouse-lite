# Warehouse Lite v0.1.7 — test evidence

Date: 2026-11-23

## Changes in this increment

- Edit, deactivate/reactivate, and guarded permanent delete for products, customers, and suppliers.
- Purchase editing writes an inventory adjustment movement; purchase voiding reverses stock only when aggregate current stock is sufficient.
- Sales invoice editing restores old quantities virtually, validates replacement lines, and writes reversal/new movements atomically.
- Sales invoice voiding restores stock and is blocked when customer receipts on/after the invoice date make allocation uncertain.
- Receipt editing validates linked invoice totals; receipt voiding preserves the record and removes it from customer balance calculations.
- Customer balances and daily sales exclude voided documents.
- IndexedDB schema upgraded from v1 to v2 with a dedicated visits store and indexes for common date/customer/product lookups; existing stores are preserved.
- Encrypted backup schema v2 includes visit history and remains backward-compatible with v1 backup files.
- Route planner groups scheduled customers by Persian weekday and district, includes due follow-ups, and stores outcomes (purchased, no purchase, unavailable, follow-up) plus notes and next follow-up date.
- Profit report computes estimated gross profit from weighted-average purchase cost; new sale lines keep cost snapshots, legacy invoices are estimated only where prior purchase records allow, and unknown-cost invoices are excluded from the covered-profit total.
- Product, purchase, supplier, sales and customer lists use search and 25-row pagination; route and profit reports are also paginated.
- IndexedDB collections are still loaded into memory on startup; this release bounds rendered rows but is not yet cursor-paginated at the storage layer.
- Dashboard greets Ali and includes a creator credit linking to Parviz Bahrami's personal website.
- Customer directory now supports live search by name, phone number and district.
- Customer account statement shows invoices and receipts chronologically, debit/credit totals, running balance and voided records without counting voids.
- Dashboard follow-up suggestions identify customers with an outstanding balance or at least seven days since their latest active sale.
- Sales flow adds a shortcut to create a customer and preserves the in-progress invoice draft when navigating between pages; focus moves to the next field after product/unit selection.
- Desktop shell is full-width with the right sidebar anchored to the viewport edge. This removes the centered 1800px max-width gutter visible in the supplied v0.1.5 screenshot.
- Responsive customer cards, statement modal, search, follow-up cards and touch layouts added.
- Branded AliFactor invoice layout identifies Ali and Hamadan as issuer/business location.
- Invoice PNG generation and native Android Web Share file-sharing path added; text-share/download fallback retained.
- Invoice print view now includes seller identity, linked receipts and invoice balance.
- PWA shell cache bumped to v11.

## Executed checks

- GitHub Actions Quality Checks: PASS — 37 tests, 0 failures.
- JavaScript syntax checks: PASS for domain, data, backup, app, utils, service worker and build script.
- Static PWA build: PASS.
- GitHub Pages deployment: PASS.
- Latest code commit under test: `d308d224aacb4329e0cf2dcd7253c989481d8fc6`.
- Latest successful CI run: https://github.com/ParvizBahramib73/warehouse-lite/actions/runs/45181922646
- Latest successful Pages deployment: https://github.com/ParvizBahramib73/warehouse-lite/actions/runs/45181922586

## Not executed or not established

- Real Chromium/PWA UI flow: NOT RUN in this environment; the supplied screenshot was inspected, and CSS/layout contracts are covered by source tests.
- Android device install, mobile/tablet UX, offline restart and Service Worker cache refresh: NOT RUN.
- IndexedDB transaction integration tests on an actual browser: NOT RUN.
- Manual verification of each edit/archive/delete/void workflow with a seeded browser database: NOT RUN.
- Backup/restore reconciliation after void/edit operations on a second device: NOT RUN.
- Real financial data correctness, legal invoice requirements and formal accounting compliance: NOT RUN.

## Safety rules implemented

- Historical products, customers and suppliers cannot be permanently deleted if referenced by purchases, sales, payments or stock movements; they can be deactivated.
- A product with positive stock cannot be deactivated.
- Purchase voiding is blocked if current aggregate stock cannot absorb the reversal.
- Sale voiding is blocked when later customer receipts make payment allocation ambiguous.
- Financial records are marked void and preserved; they are not hard-deleted.

## Phase gates

- G0 Scope: PASS for a single-device offline prototype.
- G1 Design: PASS for the scoped edit/archive/reversal behavior; detailed returns/cheques remain deferred.
- G2 Build: PASS for this code increment.
- G3 Verify: PASS for automated CI; browser/Android and IndexedDB integration remain NOT RUN.
- G4 Release: HOLD for real financial records until Android, backup restore and business-user acceptance tests pass.
- G5 Outcome: NOT RUN.

## Remaining high-priority work

1. Run the full manual pilot checklist on Android.
2. Test backup/restore after editing and voiding records; reconcile product stock and customer balances.
3. Implement proper return documents, cheque workflow and account allocation.
6. Add browser-level end-to-end tests for editing, route visits and reversal dialogs.
7. Keep using synthetic data until the release gate is explicitly accepted.
6. Validate customer statement totals and follow-up relevance with Ali's real business workflow using synthetic/test records first.


## Invoice sharing verification

- Added the AliFactor invoice identity (issuer Ali, Hamadan) to the print view and share image.
- Added a high-resolution PNG invoice image generator with customer, invoice number, item lines, totals, linked receipts and remaining amount.
- Android file sharing uses the Web Share API (`navigator.share` + `navigator.canShare({files})`). The Android share sheet presents installed compatible apps such as WhatsApp, Telegram, Rubika and Eitaa; app availability/acceptance depends on the device.
- Fallback: download the PNG and share the invoice summary text or copy it for manual attachment.
- PDF remains available through the browser print/save-as-PDF flow; direct PDF file sharing is not implemented in this increment.
- Automated invoice-share tests cover payment allocation, branded text, item details and void-invoice labelling.
