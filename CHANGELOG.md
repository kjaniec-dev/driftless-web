# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-10

First public release.

### Added
- **Buy-only rebalancing engine** in TypeScript: exact water-filling and largest-remainder rounding
  to 0.01 PLN, never exceeding the cash. Results are bit-identical to the Driftless CLI across 714
  reference cases generated from the Python engine, plus property tests of the buy-only invariants.
- **Local-first portfolios** stored in the browser (IndexedDB): create, rename, duplicate, delete;
  instrument editor with live validation (ISIN format, duplicates, weights totalling 100%).
- **Foreign-currency positions** with NBP mid rates (or manual rates), stored with their
  publication date; exact decimal conversion.
- **Backup and import/export:** versioned JSON backup with strict validation and conflict handling
  (merge / keep both / replace, previewed and applied atomically); Driftless CLI `portfolio.json`
  import and export; CSV export of the purchase plan.
- **Privacy:** no accounts, analytics, cookies or third-party requests; strict CSP and security
  headers; an in-app privacy policy; an error boundary that never reports anything.
- **Polish and English** interface, light and dark themes, responsive layout.
- **Quality gates:** unit tests, Playwright end-to-end tests (desktop and mobile) that double as a
  network/privacy audit, axe accessibility scans, keyboard tests, a production-build privacy audit,
  and a dependency licence check. See `docs/PRIVACY-REVIEW.md` and `docs/ACCESSIBILITY.md`.

### Known limitations
- The live NBP API and its CORS headers have not been verified from a deployed site.
- No service worker: a page reload needs a network connection (the loaded app works offline).
- Manual assistive-technology testing has not been done.
- Backups are unencrypted.
