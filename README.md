# Warehouse Lite | انبار من

Responsive, offline-first Persian PWA prototype for Ali's confectionery-supplies distribution business in Hamadan, Iran.

Designed and developed by [Parviz Bahrami](https://parvizbahramib73.github.io/personal-brand-website).

> **Prototype 0.1.8 — not approved for real accounting yet.** Use synthetic data only until Android device, backup/restore, financial edge-case, and security tests are completed.

## Quick links

- [راهنمای کامل فارسی](README_FA.md)
- [راهنمای انتشار GitHub Pages](DEPLOY_GITHUB_PAGES_FA.md)
- [Product brief](PROJECT_BRIEF_FA.md)
- [Pilot checklist](PILOT_CHECKLIST_FA.md)
- [Test report](TEST_REPORT.md)
- [Architecture decision](ADR-001.md)

## Architecture

- Static PWA; no server or paid database in the first pilot.
- IndexedDB stores operational records locally on one primary device.
- Manual encrypted backup/export and restore/import.
- Branded AliFactor invoice preview/print and PNG sharing through the Android system share sheet.
- Live Persian three-digit grouping in Toman input fields with cursor preservation.
- Customer search, chronological account statements with running balances, and dashboard follow-up suggestions.
- Daily visit planner: weekly customers are preloaded and any other active customer can be manually added to a dated route.
- Named routes, grouped stops, visit order, remove-from-today without deleting history, and last-visit context.
- Visit outcomes include full purchase, small/partial purchase, no purchase, unavailable, follow-up, rescheduled, no current need, declined and custom note-required outcomes.
- Follow-up/reschedule dates automatically bring customers into the matching day's route; daily visit summaries show completed, full/partial purchases, no-sale, follow-up and pending counts.
- Invoice handoff from customers marked as full/partial purchase; a visit result itself never creates an accounting entry.
- Estimated gross-profit reporting using weighted-average purchase cost; new invoices keep cost snapshots, while older invoices are reconstructed where purchase history allows.
- Search and 25-row pagination for product, purchase, supplier, sales, customer, visit and profit lists; IndexedDB v2 adds visit storage and lookup indexes. Legacy v1 encrypted backups remain importable.
- Faster invoice entry with preserved draft state and focus progression; full-width desktop shell with right-edge sidebar.
- GitHub stores source code and runs tests; it is **not** the operational database or backup store.
- Current pagination limits rendered rows, but the app still loads IndexedDB collections into browser memory at startup. Very large datasets need cursor-based database paging and a server/API phase.
- Project Pages paths are relative so the app can be hosted at `/warehouse-lite/`.

## Local development

Requires Node.js 22 and Python 3 (for local static serving). No third-party npm dependencies are required.

```bash
npm test
npm run build
npm run serve
```

Open `http://localhost:8765/` in a modern browser.

## Data safety

Never commit customer, supplier, invoice, payment, or `.wlbackup` files. No real business data belongs in this public repository. No reuse license is granted by this repository unless a LICENSE file is added later.

## Deployment

GitHub Pages is configured to deploy from the `GitHub Actions` workflow after the repository Pages source is enabled. The deployment workflow runs the quality checks and builds `dist/` before publishing.
