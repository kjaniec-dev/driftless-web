# Privacy review: Driftless Web 0.2.0

Review date: 2026-10-10. Scope: the application in this repository as built and served as static
files. It does **not** cover the hosting account, the domain, or the user's device.

The claim under review: *no financial portfolio content is sent to application endpoints; no
accounts, analytics, advertising or behavioural tracking; no external error reporting.*

## 1. Data inventory

| Data | Where it lives | Who can read it | Leaves the device? |
| --- | --- | --- | --- |
| Portfolios: names, ISINs, labels, tickers, amounts, weights, cash, dates, saved FX rates, typed unit prices and broker costs | IndexedDB database `driftless` | The user's browser profile (and anything with access to it) | No |
| Preferences: language, theme, last portfolio id, first-use dismissed | `localStorage`, keys `driftless.*` | Same | No. Holds no financial values (tested) |
| Demo portfolio | Memory only | n/a | No, and never persisted without consent |
| Backup / CLI / CSV files | Files the user chooses to download | Whoever holds the file | Only if the user moves it. Plain text, **not encrypted** |
| Cookies, `sessionStorage`, Cache API, service workers | Not used | n/a | n/a |

## 2. Network inventory

Every request the browser can make, derived from the CSP and confirmed by the build audit and the
E2E network audit:

| Destination | When | What is sent | Notes |
| --- | --- | --- | --- |
| The app's own origin (static hosting) | Page load | A GET per file: no query string, no body, no cookies | The host sees the usual request metadata (IP, time, user agent) and may keep standard logs |
| `api.nbp.pl` | Only when the user presses "Fetch NBP rates" or imports a CLI file with foreign-currency values | `GET /api/exchangerates/rates/a/<EUR\|USD\|GBP\|CHF>/?format=json`, `Accept` header only, no credentials, no referrer | NBP sees the user's IP address. The currency code is the only app-supplied information |

Nothing else: no analytics, no fonts, no CDN, no images, no error reporting, no beacons, no WebSockets.

## 3. Controls and the evidence for them

| Control | Evidence |
| --- | --- |
| CSP: `default-src 'self'`, `script-src 'self'` (no inline, no eval), `connect-src 'self' https://api.nbp.pl`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, `base-uri 'self'` | `public/_headers`; asserted by `tests/e2e/privacy.spec.ts` |
| The CSP is enforced, not just declared | E2E test injects an inline script and a request to a foreign host in a real browser; both are blocked and reported as violations |
| Other headers: `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP/CORP, HSTS | Same file and test |
| Every E2E test fails on any request that is not a body-less GET to the app origin or a well-formed NBP lookup (no cookie, referer or credentials), and on any CSP violation or console error | `tests/e2e/fixtures.ts` (auto fixture), so the audit runs across all scenarios, desktop and mobile |
| The shipped bundle contains no unapproved hosts, tracker or monitoring SDKs, beacons, sockets, or inline scripts, and the CSP allows exactly the hosts the code uses | `scripts/audit-dist.mjs` (CI step `npm run audit:dist`); negative-tested against a deliberately poisoned build |
| No cookies; storage limited to IndexedDB `driftless` and four preference keys, none containing financial data; no service worker or caches | `tests/e2e/privacy.spec.ts` |
| Errors stay local: the error boundary logs to the console only and never renders the message | `tests/ui/error-boundary.test.tsx` (no `fetch`, no `sendBeacon`, message not shown) |
| User text cannot inject markup or script (portfolio name, labels) | E2E test with `<img onerror>` / `<svg onload>` payloads; React escaping |
| CSV export cannot carry spreadsheet formulas from user text | `src/backup/csv.ts`, unit and E2E tests |
| Imported files cannot corrupt data or exploit the parser (size limit, strict schema, unknown keys and `__proto__` rejected, atomic apply) | `tests/backup/format.test.ts` (1500-case corruption fuzz), `tests/e2e/data-safety.spec.ts` |
| All processing is local: no endpoint exists that could receive a portfolio | The app has no backend code at all (`wrangler.jsonc`: static assets only) |
| The in-app privacy policy states the above, and the test fails if the CSP gains a host the policy does not name | `tests/e2e/privacy.spec.ts` |
| Dependency licences are compatible with MIT and notices ship with the app | `npm run licenses:check`, `public/THIRD-PARTY-NOTICES.txt` |

Re-run everything with `npm run build && npm run audit:dist && npm run test:e2e`.

## 4. Residual risks and limits (stated plainly)

1. **The host sees request metadata.** Cloudflare necessarily processes IP addresses and request
   details to serve the files, and may keep logs. The app cannot prevent this; the privacy policy
   says so. The aim is that the *owner* collects and stores no financial data, not that nothing is
   ever processed on the network path.
2. **Dashboard features can add scripts.** Cloudflare Web Analytics, Zaraz, Rocket Loader or similar,
   if switched on for the zone, inject scripts. The CSP would block them (and break their reports),
   but they must stay off. See `docs/RELEASE.md`.
3. **NBP learns the user's IP** when rates are requested. This is opt-in per action.
4. **Backups and exports are unencrypted JSON/CSV.** Anyone with the file can read it. The UI and
   policy say so; optional passphrase encryption would be a sensible later feature.
5. **Browser storage is not a vault.** Other software on the device, browser extensions, or someone
   with access to the profile can read IndexedDB. Private-browsing modes may refuse storage; the app
   detects this and says so.
6. **`style-src 'unsafe-inline'`** is allowed because React and the UI kit set inline `style`
   attributes. Scripts are not affected. Removing it would need changes in the kit.
7. **Headers in tests come from the file, not from Cloudflare.** `scripts/serve-dist.mjs` applies
   `_headers` the way Cloudflare static assets do, but the live behaviour must be confirmed once after
   deploying (see the checklist in `docs/RELEASE.md`).
8. **The live NBP endpoint and its CORS headers were not reachable during development.** The client
   was built to NBP's documented format and tested against fabricated responses. Confirm after deploy.
9. **No external audit.** This is a self-review with automated evidence, not a penetration test or a
   legal review. The policy text is a plain-language description, not legal advice; whoever operates a
   deployment is responsible for any additional obligations in their jurisdiction.

## 5. Recommendations for operators

- Keep Cloudflare Web Analytics, Zaraz, Rocket Loader, email obfuscation and any "optimisation" that
  rewrites HTML **off** for this zone.
- Do not add a Worker script that logs requests with URLs or headers beyond what the platform does.
- Keep `connect-src` and `NETWORK_HOSTS` in `scripts/audit-dist.mjs` in step; CI fails if they drift.
- Re-run this review whenever a dependency, host or header changes.
