// Minimal static server for the production build, used by the E2E tests.
//
// It serves dist/ exactly like Cloudflare static assets would for this app: SPA fallback to
// index.html and the response headers from dist/_headers (so the strict CSP is enforced in
// the browser during tests). Not meant for production use.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const port = Number(process.env.PORT ?? 4173);

/** Parses the Cloudflare `_headers` format: `/pattern` lines followed by indented `Name: value`. */
function parseHeaders(file) {
  const rules = [];
  let current = null;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const m = line.match(/^\s+([\w-]+):\s*(.+)$/);
      if (m) current.headers[m[1]] = m[2];
    }
  }
  return rules;
}

const matches = (pattern, urlPath) => {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return re.test(urlPath);
};

const rules = parseHeaders(path.join(root, "_headers"));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = path.join(root, path.normalize(urlPath));
    // Never serve anything outside dist/ (path traversal), and fall back to the SPA shell.
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, "index.html");
    }
    const servedPath = file === path.join(root, "index.html") ? "/index.html" : urlPath;
    const headers = { "content-type": types[path.extname(file)] ?? "application/octet-stream" };
    for (const rule of rules) {
      if (matches(rule.pattern, servedPath)) Object.assign(headers, rule.headers);
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`serving dist on http://localhost:${port}`));
