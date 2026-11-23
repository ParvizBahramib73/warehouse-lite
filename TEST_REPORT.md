# Warehouse Lite v0.1 — test evidence

Date: 2026-11-23

## Code created

`index.html`, `app.css`, `src/{app,domain,data,backup,utils}.js`, `sw.js`, `manifest.webmanifest`, PNG icons, developer docs, GitHub Actions workflow.

## Executed checks

- `node --check` for each script: PASS
- `npm test`: **12 PASS / 0 FAIL** (domain precision, pack conversions, money, oversell guard, customer balance, encrypted backup roundtrip, wrong password/tampering, stock-snapshot invariants, manifest assets and service worker precache paths, no remote CDN dependency)
- `npm run build`: PASS; generated `dist/` static PWA output.
- GitHub Pages project-site paths use relative assets and were covered by unit tests.
- GitHub repository publication commit: `fd87d5ccbbe405be8e07d3c868c9256aba8b420f` (Actions/Pages deployment still pending).

## Not executed or not established

- Real Chromium/PWA UI flow: **NOT RUN**. The sandbox's managed Chromium refused all navigations with `net::ERR_BLOCKED_BY_ADMINISTRATOR` (including localhost and file URLs). The source was checked and unit tests run, but no browser E2E test passed in this environment.
- Android device install, screen layout, offline-restart behavior: **NOT RUN**.
- IndexedDB purchase/sale atomicity and persistence in a real browser: **NOT RUN**.
- Export/download of backup on Android and restoration in a second browser/device: **NOT RUN**.
- Printing PDF and sharing on Android: **NOT RUN**.
- Auth and user-access security review of a hosted real deployment: **NOT RUN** (single-device no-login prototype only).

## Phase gates

- G0 Scope: PASS (documented agreed single-device offline pilot, synthetic-data first).
- G1 Design: provisional prototype ADR recorded; Android validation outstanding.
- G2 Build: first scoped feature slice implemented, not complete PRD.
- G3 Verify: 10 Node tests pass; browser/Android E2E not run.
- G4 Release: HOLD. **Not approved for real financial records** until restore and business-critical corrections/payments are implemented and tested.
- G5 Outcome: NOT RUN.

## High-priority remaining work

1. Verify on Android Chrome (including airplane mode and app restart).
2. Fix issues revealed by user feedback and browser E2E.
3. Implement returns/cancellations, cheque workflow, correct account statement, and controlled stock correction.
4. Verify encrypted backup restoration with manual counts and balance reconciliation.
5. Add device protection/privacy controls; formal trial before using real business data.
