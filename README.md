# Driftless Web

Free, open-source, **privacy-first** ETF portfolio rebalancer. It tells you how to spend new
money so your portfolio moves back toward its target weights, **by buying only**.

- No accounts, no ads, no behavioural tracking.
- Portfolio data never leaves your browser; all calculations run locally and work offline.
- Transparent maths: a TypeScript port of the [Driftless CLI](https://github.com/kjaniec-dev/driftless)
  engine, verified against it bit-for-bit.

> Driftless is a mathematical planning tool, not investment advice.

## Status

Version 0.2.0: phases 1 to 4 of the roadmap are done. Phase 4 added a plan in whole units from
prices you type in. Automatic ETF quotes (a shared cache, rate limits) still depend on a data
licence and are not built: see [`docs/QUOTES.md`](docs/QUOTES.md).

| Area | State |
| --- | --- |
| Buy-only engine, validation, CLI `portfolio.json` adapter | Done, golden-tested against the Python CLI |
| Local portfolios (IndexedDB), editor, backup/import/export, CSV | Done |
| NBP exchange rates (fetch + manual fallback) | Implemented; **not verified against the live API** |
| Polish/English, light/dark, responsive | Done |
| E2E (desktop + mobile), accessibility, privacy audit, CI | Done |
| Manual assistive-technology testing, live NBP check, first deployment | Not done yet (see `docs/RELEASE.md`) |
| Whole-unit plan from typed prices, with broker commission | Done (v0.2.0), golden-checked against an exhaustive search |
| Automatic ETF quotes, shared cache, rate limits | Not built: needs a data licence (`docs/QUOTES.md`) |

## Stack

TypeScript 7 (native compiler) · React 19 · Vite 8 · Tailwind CSS 4 ·
[`@kjaniec-dev/ui`](https://github.com/kjaniec-dev/ui-kit) + `@kjaniec-dev/design` ·
Cloudflare Workers (static assets) · Vitest · Biome.

## Develop

```bash
npm install
npm run dev          # Vite dev server
npm test             # unit, golden parity and component tests (Vitest)
npm run typecheck    # tsc -b (TypeScript 7)
npm run lint         # biome
npm run build        # outputs dist/ for Cloudflare
npm run audit:dist   # privacy audit of the production build (run after build)
npm run test:e2e     # Playwright: workflows, offline, accessibility, privacy (run after build)
# deployment: Cloudflare builds and deploys on push, see docs/RELEASE.md
```

The first time, install a browser for the E2E tests with `npx playwright install chromium`. If you
already have a Chromium, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at it instead.

Requires Node 22+.

## Layout

```
src/core/       Pure domain logic: engine, validation, CLI-format adapter. No React, no I/O.
src/storage/    Persisted model, validation, Dexie repository, editor-draft conversion.
src/backup/     Backup format, import planning, CLI/CSV conversion, file helpers.
src/market/     NBP client (public data only; no portfolio data is ever sent).
src/app/        Session context: the active portfolio (stored or in-memory demo).
src/features/   One folder per screen.
src/i18n/       Typed PL/EN dictionaries (PL must match EN's shape; enforced by tsc + tests).
src/lib/        Router, theme, formatting, preference storage.
public/_headers CSP, security and cache headers served by Cloudflare.
tests/golden/   Reference cases generated from the Python CLI.
tests/e2e/      Playwright suites; every test also audits network traffic for privacy.
scripts/        generate-golden.py, audit-dist.mjs, serve-dist.mjs, third-party-notices.mjs
docs/           PRIVACY-REVIEW.md, ACCESSIBILITY.md, RELEASE.md
```

## The calculation engine

`src/core/engine.ts` ports `driftless.engine.compute_plan`: exact water-filling over the
underweight positions, then largest-remainder rounding to 0.01 PLN that can never exceed the cash.
Holdings outside the target are listed (target 0%) but never traded.

**Why plain floats, not a decimal library.** The requirement is to preserve the CLI's results.
The reference computes in IEEE doubles, so the port does too; only the final grosz rounding
decides outputs. Two details are reproduced on purpose (`src/core/float.ts`): CPython's
compensated `sum()` (3.12+) and `round()` half-to-even. Replacing the compensated sum with a naive
loop breaks 112 of the 714 golden cases, so don't "simplify" it. Amounts are accepted from the UI
through a strict decimal parser (`src/core/decimal.ts`), never `parseFloat`.

**Golden tests.** `tests/golden/engine.golden.json` holds 714 cases (the CLI's own scenarios, ties,
tiny amounts, off-target holdings, up to 60 ETFs, random seeds) produced by running the real Python
engine. `tests/core/golden.test.ts` asserts exact equality of every field. Regenerate only when the
Python engine intentionally changes:

```bash
git clone https://github.com/kjaniec-dev/driftless
DRIFTLESS_SRC=./driftless/src npm run golden   # needs Python >= 3.12
```

The generator records the Python version and the CLI commit in the file.

**Invariants** (property-tested on 3000 random portfolios): no negative purchases, total spend never
exceeds the cash by even 0.01 PLN, nothing is bought past its target, and all funded positions end
with the same remaining shortfall.

**CLI compatibility.** `parseCliPortfolio` / `toCliPortfolio` read and write the CLI's
`portfolio.json` exactly (the CLI schema forbids extra properties, so web-only data belongs in the
native backup format, not here). Foreign-currency positions need exchange rates injected by the
caller; the NBP client arrives in Phase 2.

## The whole-unit plan

`src/core/units.ts` turns the amount plan into a number of whole units per instrument at the prices
the user typed in (a price per unit, its currency and a rate when it is not PLN, and the date it was
read). It is a separate, discrete problem solved by search:

    minimise  sum_i (ideal_i - cost_i(units_i))^2   subject to   sum_i cost_i + fee_i <= cash

where `ideal_i` is what the amount plan would buy. All arithmetic is integer grosze; a unit's cost is
the exact fraction price x rate and is **rounded up**, so a plan never needs more cash than it shows.
The commission is a percentage of the order (parts per million, so the rate is exact) with a minimum
per order; instruments that are not bought pay nothing. The search starts from rounding every order
down, then repeats single-unit add / remove / swap moves and an exact re-solve of every pair until
nothing improves (ties go to the earlier instrument, so results are deterministic). It matches an
exhaustive search on every random two-instrument case in the tests and on all but 1 in 1500
three-instrument cases (that one within 18% of a tiny error). With more than 40 instruments the pair
stage is skipped. Spreads are not modelled, and instruments without a price are skipped with a warning.

## Data, storage and import/export

- **Stored model.** Money and weights are canonical decimal strings (PRD section 8), converted to
  numbers only at the calculation boundary. Foreign-currency values are converted exactly (BigInt,
  rounded half-up to the grosz), so 100 EUR at 4.256 is 425.60, never 425.59999999999997.
- **Nothing invalid is ever stored.** Once a portfolio has instruments, weights must total 100%
  (within the CLI's 1e-4 tolerance) and ISINs must be unique. The editor keeps a draft and only
  writes on an explicit, valid save; storage re-validates anyway.
- **Prices and costs** are optional: `price` on an instrument (`value`, `currency`, `rate`, `quotedOn`)
  and `costs` on a portfolio (`commissionRate` as a fraction with at most six decimals, and
  `commissionMinPln`). They are web-only: the CLI format has no place for them, so the CLI export
  leaves them out.
- **Backup format** is `{ format: "driftless-web", schemaVersion, exportedAt, portfolios }` (schema
  version 2; version 1 files still import, and may not contain prices or costs). Parsing is
  strict (unknown keys, wrong types, bad numbers, newer schema versions and files over 5 MB are
  rejected) and imports are applied in one transaction, so a bad file cannot corrupt existing data.
- **Conflicts** are matched by portfolio id. *Merge* keeps whichever side was updated last (ties keep
  local), *Keep both* imports copies under new ids and names, *Replace* overwrites matches and asks
  for confirmation first. The preview shows the outcome for every portfolio before anything changes.
- **CLI files** are detected automatically. Import creates a new portfolio; export writes exactly the
  CLI schema (positions as `value_pln`) and is only offered when the portfolio has targets.
- **CSV** export is a result artefact (UTF-8 with BOM, `.` decimals). Text cells are neutralised
  against spreadsheet formula injection.
- **Demo data** lives in memory and is only written to storage if the user chooses
  "Save as my portfolio".

## Quality gates

CI (`.github/workflows/ci.yml`) runs lint, types, unit tests, the dependency licence check, the build
and the production privacy audit, then the Playwright suite. Deployment is Cloudflare's Git integration;
because it does not wait for CI, `main` should be protected so that only passing pull requests can be
merged (see `docs/RELEASE.md`).

- **Privacy:** every E2E test fails on any request that is not a body-less GET to the app's own origin
  or a well-formed NBP lookup, and on any CSP violation or console error. Details and residual risks:
  [`docs/PRIVACY-REVIEW.md`](docs/PRIVACY-REVIEW.md).
- **Accessibility:** axe scans of every screen in light/dark and desktop/mobile, keyboard-only flows,
  reflow at 320 px. What is and is not covered: [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md).
- **Releasing:** [`docs/RELEASE.md`](docs/RELEASE.md), including the post-deploy checklist.

## Known limitations

- **NBP is untested against the live API.** `api.nbp.pl` was not reachable from the development
  environment, so the client follows NBP's documented format and is tested with fabricated responses.
  Whether the endpoint works from a browser (CORS) must be confirmed after deploying; if it does not,
  the app falls back to manual rates and a small proxy Worker would be the fix.
- No assistive-technology testing by hand has been done, and the suites run on Chromium only.
- The UI kit has several accessibility defects that are worked around here (listed in
  `docs/ACCESSIBILITY.md`); the Polish interface still has an English "Open navigation" label on the
  mobile menu button.
- No service worker: the loaded app works offline, but reloading the page offline needs the PWA work
  planned for a later release.
- If two tabs edit the same portfolio, the editor warns and offers to reload, but the last save wins.
- Storage is per browser profile; there is no sync (a deliberate privacy trade-off). Backups are not
  encrypted.
- ISINs are validated by format only (as in the CLI), not by check digit.
- The JavaScript is about 594 kB (about 180 kB gzipped), in two files: the libraries (React, the UI kit,
  Dexie; about 490 kB) and the app itself (about 105 kB). They are split so that after a release a
  returning visitor re-downloads only the app file. Splitting the screens into lazily loaded chunks was
  tried and measured: it saved only about 6% on first load, because the libraries dominate, so it was not kept.

## License

MIT
