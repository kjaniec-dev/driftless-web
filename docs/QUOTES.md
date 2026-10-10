# Quotes: why Driftless does not fetch ETF prices (yet)

Decision record for the part of Phase 4 that the PRD ties to a data licence.

## Decision

Driftless does not fetch share or ETF prices. The whole-unit plan uses prices the user types in,
each with an optional date, and warns when a price is missing or old. Exchange rates still come from
NBP, on request, because NBP publishes them as public reference data.

## Why

The PRD's privacy and licensing rules rule out the easy options:

- **No backend, no accounts, no tracking.** A shared quote cache with rate limiting needs a server
  component that sees requests. That is a different product from a static, local-first app, and it
  would change the privacy policy (`/privacy`) and the CSP (`connect-src`).
- **Free quote sources generally forbid public display or redistribution.** Yahoo Finance
  (including `yfinance`), Stooq and the free tiers of EODHD or Twelve Data are, as far as the PRD
  records, for personal use. Showing their numbers in a public app, or caching them to serve many
  users, is what their terms usually exclude. *This has not been verified against the vendors'
  current terms; whoever turns quotes on must read them first.*
- **A wrong price silently produces a wrong order size.** A number the user typed from their broker is
  the number they will actually trade at; a delayed or stale quote is not.

## What a "free" route could look like

| Option | Cost | Licence | Privacy | Verdict |
| --- | --- | --- | --- | --- |
| **Typed prices** (built) | none | none needed | nothing leaves the device | Done |
| **Bring your own key** (user pastes a personal API key; the browser calls the vendor directly) | the user's own free tier | the user's personal licence, so Driftless redistributes nothing | the vendor sees the user's IP and the symbols; the key sits in local storage | Possible later. Needs the vendor to allow browser requests (CORS), a CSP entry per vendor, and a clear warning. Not built. |
| **Scheduled Worker that fetches a licensed feed into a public file** | licence fee | must permit public display and caching | no per-user requests, so privacy is unchanged | The PRD's intended design, blocked on a licence. |
| **Scraping a free site from a Worker** | none | usually a terms violation | n/a | Rejected. |

So there is no free way to show quotes to everyone. The only free way is for each user to supply their
own data, which is what typed prices do today and what a bring-your-own-key option would automate.

## If quotes are added later

1. Get a licence that explicitly allows public display and caching, and record it here.
2. Prefer a Worker that publishes a static, dated JSON file over a request-per-user API, so the app
   keeps loading prices without telling anyone which instruments a visitor holds.
3. Add the origin to `connect-src` in `public/_headers`, update `/privacy` and
   `docs/PRIVACY-REVIEW.md`, and extend the E2E network audit to expect exactly that request.
4. Show the quote's date and source on every price, and keep the stale-price warning.
5. Keep typed prices as the fallback and as an override.
