# Driftless Web

Free, open-source, **privacy-first** ETF portfolio rebalancer. It tells you how to spend new
money so your portfolio moves back toward its target weights, **by buying only**.

- No accounts, no ads, no behavioural tracking.
- Portfolio data never leaves your browser; all calculations run locally and work offline.
- Transparent maths: a TypeScript port of the [Driftless CLI](https://github.com/kjaniec-dev/driftless)
  engine, verified against it bit-for-bit.

> Driftless is a mathematical planning tool, not investment advice.

## Status

Phases 1 and 2 of the roadmap (see the PRD) are done. Phase 3 (E2E and accessibility suites,
privacy review, release) and Phase 4 (licensed ETF quotes) are next.

| Area | State |
| --- | --- |
| Buy-only engine, validation, CLI `portfolio.json` adapter | Done, golden-tested against the Python CLI |
| App shell, PL/EN, light/dark | Done |
| Multiple portfolios (create, rename, duplicate, delete) in IndexedDB (Dexie) | Done |
| Instrument editor with live validation and explicit save | Done |
| Backup export/import (versioned JSON, merge / keep both / replace), CLI import/export, CSV plan export | Done |
| NBP exchange rates (fetch + manual fallback, rate and publication date stored) | Implemented, **not verified against the live API** (see limitations) |
| Browser E2E + automated accessibility suite, privacy review, release | Phase 3 |
| Licensed ETF quotes, cache, rate limits, unit-based plans | Phase 4 |

## Stack

TypeScript 7 (native compiler) · React 19 · Vite 8 · Tailwind CSS 4 ·
[`@kjaniec-dev/ui`](https://github.com/kjaniec-dev/ui-kit) + `@kjaniec-dev/design` ·
Cloudflare Workers (static assets) · Vitest · Biome.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm test           # unit + golden parity + UI tests
npm run typecheck  # tsc -b (TypeScript 7)
npm run lint       # biome
npm run build      # outputs dist/ for Cloudflare
npx wrangler deploy  # deploy dist/ (needs a Cloudflare login)
```

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
public/_headers CSP and security headers served by Cloudflare.
tests/golden/   Reference cases generated from the Python CLI.
scripts/        generate-golden.py
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

## Data, storage and import/export

- **Stored model.** Money and weights are canonical decimal strings (PRD section 8), converted to
  numbers only at the calculation boundary. Foreign-currency values are converted exactly (BigInt,
  rounded half-up to the grosz), so 100 EUR at 4.256 is 425.60, never 425.59999999999997.
- **Nothing invalid is ever stored.** Once a portfolio has instruments, weights must total 100%
  (within the CLI's 1e-4 tolerance) and ISINs must be unique. The editor keeps a draft and only
  writes on an explicit, valid save; storage re-validates anyway.
- **Backup format** is `{ format: "driftless-web", schemaVersion, exportedAt, portfolios }`. Parsing is
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

## Known limitations

- **NBP is untested against the live API.** `api.nbp.pl` was blocked by the network policy of the
  development sandbox, so the client was built to NBP's documented table-A response and tested with
  mocked responses plus a real-browser check of the failure path. Whether the live endpoint works from
  a browser (CORS) still has to be confirmed after deployment; if it does not, the planned fallback is
  a tiny public Worker proxy. The editor always allows entering a rate by hand.
- The UI kit's `Modal` stays mounted when closed (hidden with CSS only), which leaves its controls
  focusable. Dialogs here are mounted only while open; this should be fixed upstream in `ui-kit`.
- `DashboardShell` hard-codes the English `aria-label` "Open navigation" on the mobile menu button.
- No service worker yet: the app works offline once loaded, but a reload while offline needs the PWA
  work planned for later.
- If two tabs edit the same portfolio, the editor warns and offers to reload, but the last save wins.
- Storage is per browser profile; there is no sync (a deliberate privacy trade-off).
- ISINs are validated by format only (as in the CLI), not by check digit.
- The JavaScript bundle is about 570 kB (about 170 kB gzipped); route-level code splitting is a
  possible follow-up.
- The CI workflow is untested until it first runs on GitHub.

## License

MIT
