// Privacy audit of the production build (run after `npm run build`, part of CI).
//
//   node scripts/audit-dist.mjs [dist-dir]
//
// Fails when the built app could talk to, or ship code from, anything we have not explicitly
// approved: unknown hosts, analytics/tracking SDKs, beacons/sockets, inline scripts, or a CSP
// that allows more than the code actually needs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist"),
);

/** Hosts the app may contact at runtime. Keep this list in step with `connect-src`. */
const NETWORK_HOSTS = new Map([
  ["api.nbp.pl", "public NBP exchange rates; the request carries only a currency code"],
]);

/** Hosts that appear only inside strings or comments and are never requested. */
const TEXT_ONLY_HOSTS = new Map([
  ["www.w3.org", "XML / SVG namespace identifiers"],
  ["react.dev", "React production error message text"],
  ["tinyurl.com", "Dexie error message text"],
  ["bit.ly", "Dexie error message text"],
  ["tailwindcss.com", "licence comment"],
]);

/** Code that sends data out of the page, or that tracking products ship with. */
const FORBIDDEN = [
  [/sendBeacon/, "navigator.sendBeacon"],
  [/new\s+WebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/google-analytics|googletagmanager|\bgtag\s*\(/i, "Google Analytics / Tag Manager"],
  // Word boundaries matter: "rollbar" is also inside "scrollbar".
  [/\b(sentry|bugsnag|rollbar|logrocket|datadog|newrelic)\b/i, "error-reporting / monitoring SDK"],
  [
    /\b(plausible|posthog|mixpanel|amplitude|hotjar|fullstory)\b|clarity\.ms|segment\.(io|com)/i,
    "analytics / session-replay SDK",
  ],
  [/fonts\.(googleapis|gstatic)\.com|cdnjs|unpkg\.com|jsdelivr/i, "third-party CDN"],
];

const problems = [];
const notes = [];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

if (!fs.existsSync(root)) {
  console.error(`dist directory not found: ${root} (run \`npm run build\` first)`);
  process.exit(2);
}

const urlRe = /https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g;
const seen = new Map();
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  // THIRD-PARTY-NOTICES.txt is licence documentation (full of project links), not code.
  if (
    !/\.(js|css|html|svg|json|txt|webmanifest)$/.test(file) ||
    rel === "_headers" ||
    rel === "THIRD-PARTY-NOTICES.txt"
  )
    continue;
  const text = fs.readFileSync(file, "utf8");

  for (const url of text.match(urlRe) ?? []) {
    const host = new URL(url).host;
    seen.set(host, (seen.get(host) ?? 0) + 1);
    if (!NETWORK_HOSTS.has(host) && !TEXT_ONLY_HOSTS.has(host)) {
      problems.push(`${rel}: unapproved host ${host} (${url.slice(0, 80)})`);
    }
  }
  if (/\.(js|html)$/.test(file)) {
    for (const [re, label] of FORBIDDEN) {
      if (re.test(text)) problems.push(`${rel}: forbidden ${label}`);
    }
  }
  if (rel.endsWith(".html")) {
    const inline = [...text.matchAll(/<script\b([^>]*)>/gi)].filter(
      (m) => !/\bsrc\s*=/.test(m[1] ?? ""),
    );
    if (inline.length)
      problems.push(`${rel}: inline <script> (blocked by the CSP, and a tracking vector)`);
    for (const m of text.matchAll(
      /<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)\s*=\s*"(https?:[^"]+)"/gi,
    )) {
      problems.push(`${rel}: external resource ${m[1]}`);
    }
  }
}

// --- the shipped CSP must allow exactly what the app uses, no more
const headersFile = path.join(root, "_headers");
if (!fs.existsSync(headersFile)) {
  problems.push("_headers is missing: no CSP or security headers would be served");
} else {
  const headers = fs.readFileSync(headersFile, "utf8");
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? "";
  if (!csp) problems.push("_headers: no Content-Security-Policy");
  const directive = (name) =>
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `)) ?? "";
  const connect = directive("connect-src").split(/\s+/).slice(1);
  for (const source of connect) {
    if (source === "'self'") continue;
    const host = source.replace(/^https?:\/\//, "");
    if (!NETWORK_HOSTS.has(host))
      problems.push(`_headers: connect-src allows ${source}, which the app does not use`);
  }
  for (const host of NETWORK_HOSTS.keys()) {
    if (!connect.some((s) => s.endsWith(host)))
      problems.push(`_headers: connect-src does not allow ${host}, which the app uses`);
  }
  if (/script-src[^;]*'unsafe-(inline|eval)'/.test(csp))
    problems.push("_headers: script-src allows unsafe-inline/unsafe-eval");
  for (const required of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ]) {
    if (!csp.includes(required)) problems.push(`_headers: CSP is missing \`${required}\``);
  }
  for (const header of [
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]) {
    if (!new RegExp(`^\\s+${header}:`, "mi").test(headers))
      problems.push(`_headers: missing ${header}`);
  }
}

if (fs.existsSync(path.join(root, "index.html")) === false) problems.push("index.html is missing");
for (const [host, count] of [...seen].sort()) {
  const kind = NETWORK_HOSTS.has(host)
    ? `network: ${NETWORK_HOSTS.get(host)}`
    : `text only: ${TEXT_ONLY_HOSTS.get(host) ?? "UNAPPROVED"}`;
  notes.push(`  ${host.padEnd(18)} x${String(count).padEnd(3)} ${kind}`);
}

console.log(
  `Privacy audit of ${path.relative(process.cwd(), root) || "."}\nHosts found in the build:\n${notes.join("\n")}`,
);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(
  "\nOK: no unapproved hosts, trackers, beacons or inline scripts; CSP matches the app's real needs.",
);
