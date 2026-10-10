# Releasing Driftless Web

The app is a static site (Cloudflare Workers with Static Assets). There is no server code, database
or secret in the build.

## One-time setup

1. A Cloudflare account. In the repository settings add **secrets** `CLOUDFLARE_API_TOKEN`
   (an API token allowed to edit Workers) and `CLOUDFLARE_ACCOUNT_ID`, and create a GitHub
   **environment** named `production` (optionally with required reviewers).
2. Optional: attach a custom domain to the Worker in the Cloudflare dashboard.
3. In the Cloudflare dashboard, for this zone/Worker keep these **off**: Web Analytics, Zaraz, Rocket
   Loader, email address obfuscation, and any HTML-rewriting optimisation. They inject scripts; the
   CSP blocks them, but they must not be enabled (see `docs/PRIVACY-REVIEW.md`).

## Releasing

1. Update `CHANGELOG.md` and the `version` in `package.json`; merge to `main`.
2. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`. The **Deploy** workflow runs the whole CI
   (lint, types, unit tests, licence check, build, privacy audit, E2E with accessibility and privacy
   checks) and deploys only if all of it passes. It can also be started manually.
3. Local alternative: `npm run build && npx wrangler deploy` (after `wrangler login`).

## After the first deploy (checklist: not automatable from CI)

- [ ] **Headers on the live site.** `curl -sI https://<your-domain>/` shows the
      `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy: no-referrer` and
      `X-Content-Type-Options` headers from `public/_headers`; a hashed file under `/assets/` has
      `Cache-Control: public, max-age=31536000, immutable`; `/` has `no-cache`.
- [ ] **No CSP violations.** Open the site with DevTools open, use every screen, and confirm the console
      is clean.
- [ ] **NBP from a real browser.** In the editor add an EUR instrument and press "Fetch NBP rates".
      The request must succeed from your domain (this proves NBP allows cross-origin requests, which
      could not be tested during development). If it fails with a CORS error, the app degrades to manual
      rates; the fix is a small public proxy Worker, not a loosened CSP.
- [ ] **Offline.** Load the app, switch the network off, create and save a portfolio, calculate a plan.
- [ ] **Backup round trip** on the live site: export, clear site data, import.
- [ ] **Deep links.** `https://<your-domain>/#/rebalance` loads directly (hash routing, no rewrites needed).

## Rollback

`npx wrangler rollback` (or promote an earlier deployment in the Cloudflare dashboard). Users' data is
local, so a rollback never touches it; note that stored data written by a newer schema version would
need the newer app, and the backup importer refuses files from a newer schema.

## What a release does not promise

No data is kept server-side, so there is nothing to migrate or restore centrally. Users are responsible
for their own backups, and the app tells them so.
