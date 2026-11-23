# Warehouse Lite v0.1.1 — test evidence

Date: 2026-11-23

## Changes in this increment

- Edit, deactivate/reactivate, and guarded permanent delete for products, customers, and suppliers.
- Purchase editing writes an inventory adjustment movement; purchase voiding reverses stock only when aggregate current stock is sufficient.
- Sales invoice editing restores old quantities virtually, validates replacement lines, and writes reversal/new movements atomically.
- Sales invoice voiding restores stock and is blocked when customer receipts on/after the invoice date make allocation uncertain.
- Receipt editing validates linked invoice totals; receipt voiding preserves the record and removes it from customer balance calculations.
- Customer balances and daily sales exclude voided documents.
- PWA shell cache bumped to v3.

## Executed checks

- GitHub Actions Quality Checks: PASS — 19 tests, 0 failures.
- JavaScript syntax checks: PASS for domain, data, backup, app, utils, service worker and build script.
- Static PWA build: PASS.
- GitHub Pages deployment: PASS.
- Latest code commit under test: `82db51840d88417aaa8853fb90fa88ffa5e181d6`.
- Latest successful CI run: https://github.com/ParvizBahramib73/warehouse-lite/actions/runs/45171053397
- Latest successful Pages deployment: https://github.com/ParvizBahramib73/warehouse-lite/actions/runs/45171053344

## Not executed or not established

- Real Chromium/PWA UI flow: NOT RUN in this environment.
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
4. Add browser-level end-to-end tests for editing and reversal dialogs.
5. Keep using synthetic data until the release gate is explicitly accepted.
