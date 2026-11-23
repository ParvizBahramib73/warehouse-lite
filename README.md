# Warehouse Lite | انبار من

Offline-first Persian PWA prototype for Ali's confectionery-supplies distribution business in Hamadan, Iran.

Designed and developed by [Parviz Bahrami](https://parvizbahramib73.github.io/personal-brand-website).

> **Prototype 0.1.2 — not approved for real accounting yet.** Use synthetic data only until Android device, backup/restore, financial edge-case, and security tests are completed.

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
- GitHub stores source code and runs tests; it is **not** the operational database or backup store.
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
