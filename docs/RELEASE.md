# Releasing Driftless Web

The app is a static site (Cloudflare Workers with Static Assets). There is no server code, database
or secret in the build.

## How deployment works

Cloudflare's **Workers Builds** (the Git integration, set up in the Cloudflare dashboard) builds and
deploys on every push:

- **`main`** is the production branch. A push to `main` (a merged pull request) builds and deploys
  production. The build and deploy commands are set in the dashboard (Worker, Settings, Build); they
  should be `npm run build` and `npx wrangler deploy`. Check that the *production* deploy command is
  not `npx wrangler preview`, which is only meant for branch builds.
- **Every other branch** gets a preview: Cloudflare runs `npx wrangler preview` and comments the
  preview URL on the pull request. That command needs the empty `previews` block that
  `wrangler.jsonc` contains; without it the build fails with "missing a `previews` block".

There is no deploy workflow in this repository, on purpose: two deploy paths would deploy twice.

## Make CI the gate (do this once, in GitHub)

Cloudflare does **not** wait for the GitHub checks, and `main` is production. So protect `main` in
*Settings, Branches (or Rulesets)*:

- require a pull request before merging, and
- require the status checks **"Lint, types, unit tests, build, audits"** and **"End-to-end,
  accessibility and privacy (Playwright)"** to pass.

Then only code that passed the tests, the privacy audit and the accessibility scans can reach
production. Without this, a direct push to `main` deploys untested code.

## One-time Cloudflare setup

1. In the dashboard keep these **off** for this Worker/zone: Web Analytics, Zaraz, Rocket Loader, email
   address obfuscation, and any optimisation that rewrites HTML. They inject scripts; the CSP blocks
   them, but they must not be enabled (see `docs/PRIVACY-REVIEW.md`).
2. Optional: attach a custom domain to the Worker.

## Releasing

1. In a pull request, update `CHANGELOG.md` and the `version` in `package.json`.
2. Merge it once the required checks are green. Cloudflare builds and deploys production.
3. Tag the release for the record: `git tag v0.2.0 && git push origin v0.2.0` (a tag does not deploy).
4. Run the checklist below.

The libraries are built into their own file (`vendor-*.js`, currently just under Vite's 500 kB warning
threshold). If a new dependency makes the build print "Some chunks are larger than 500 kB", that is a
warning, not an error, but it is a prompt to check what was added.

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

In the Cloudflare dashboard, open the Worker's deployments and roll back to an earlier one (or
`npx wrangler rollback` with a login). Users' data is local, so a rollback never touches it; note that
stored data written by a newer schema version would need the newer app, and the backup importer
refuses files from a newer schema.

## What a release does not promise

No data is kept server-side, so there is nothing to migrate or restore centrally. Users are responsible
for their own backups, and the app tells them so.
