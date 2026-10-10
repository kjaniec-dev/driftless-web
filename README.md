# Driftless Web

Free, open-source, **privacy-first** ETF portfolio rebalancer. It tells you how to spend new
money so your portfolio moves back toward its target weights, **by buying only**.

- No accounts, no ads, no behavioural tracking.
- Portfolio data never leaves your browser; all calculations run locally and work offline.
- Transparent maths: a TypeScript port of the [Driftless CLI](https://github.com/kjaniec-dev/driftless)
  engine, verified against it bit-for-bit.

> Driftless is a mathematical planning tool, not investment advice.

## Status

Phase 1 of the roadmap (see the PRD): frontend foundation, UI Kit integration and the TypeScript
calculation engine. The UI currently runs on **in-memory demo data**; persistence, the editor,
import/export and NBP rates are Phase 2.

| Area | State |
| --- | --- |
| Buy-only engine, validation, CLI `portfolio.json` adapter | Done, golden-tested against the Python CLI |
| App shell, PL/EN, light/dark, Start / Portfolio / Rebalance / Data screens | Done (demo data) |
| Instrument editor, IndexedDB (Dexie), backup import/export, NBP FX | Phase 2 |
| E2E + accessibility test suite, privacy review, release | Phase 3 |
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

## Known limitations

- Demo data only; nothing is persisted yet.
- `DashboardShell` from the UI kit hard-codes the English `aria-label` "Open navigation" on the
  mobile menu button; this needs a prop upstream in `ui-kit`.
- ISINs are validated by format only (as in the CLI), not by check digit.
- Tables scroll horizontally on narrow screens; card layouts for mobile are planned with the editor.
- The CI workflow is untested until it first runs on GitHub.

## License

MIT
