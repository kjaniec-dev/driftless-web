import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
  type Request,
} from "@playwright/test";

const APP_ORIGIN = "http://localhost:4173";
/** The only third-party request the app may ever make: one public NBP rate, by currency code. */
const NBP_URL =
  /^https:\/\/api\.nbp\.pl\/api\/exchangerates\/rates\/a\/(EUR|USD|GBP|CHF)\/\?format=json$/;

export interface Audit {
  readonly requests: readonly Request[];
  /** Console/page errors matching one of these are tolerated (e.g. an NBP call that is aborted on purpose). */
  allowConsole: RegExp[];
  /** Set by tests that deliberately provoke a CSP violation to prove the policy is enforced. */
  allowCsp: boolean;
}

/**
 * Every E2E test doubles as a privacy and health audit. After the test body, the recorded
 * traffic must contain nothing but static GETs to our own origin and (optionally) NBP rate
 * lookups, and the browser must have reported no CSP violations, page errors or console errors.
 */
export const test = base.extend<{ audit: Audit }>({
  audit: [
    async ({ context }, use) => {
      const requests: Request[] = [];
      const problems: string[] = [];
      const audit: Audit = { requests, allowConsole: [], allowCsp: false };

      context.on("request", (r) => requests.push(r));
      context.on("page", (page) => {
        page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
        page.on("console", (m) => {
          if (!["error", "warning"].includes(m.type())) return;
          const text = m.text();
          const csp = /content security policy/i.test(text);
          if (csp ? !audit.allowCsp : !audit.allowConsole.some((re) => re.test(text))) {
            problems.push(`console.${m.type()}: ${text}`);
          }
        });
      });

      await use(audit);

      for (const r of requests) {
        const url = new URL(r.url());
        const where = `${r.method()} ${r.url()}`;
        if (url.protocol === "data:" || url.protocol === "blob:") continue;
        if (url.origin === APP_ORIGIN) {
          if (r.method() !== "GET") problems.push(`non-GET request to the app origin: ${where}`);
          if (r.postData()) problems.push(`request body sent: ${where}`);
          if (url.search) problems.push(`query string on an app request: ${where}`);
        } else if (NBP_URL.test(r.url())) {
          const h = await r.allHeaders();
          if (r.method() !== "GET") problems.push(`NBP request is not a GET: ${where}`);
          if (r.postData()) problems.push(`NBP request carries a body: ${where}`);
          if (h.cookie) problems.push(`NBP request carries cookies: ${where}`);
          if (h.referer) problems.push(`NBP request leaks a referer: ${where}`);
          if (h.authorization) problems.push(`NBP request carries credentials: ${where}`);
        } else {
          problems.push(`unexpected external request: ${where}`);
        }
      }
      expect(problems, "privacy / health audit").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** NBP table-A payload in the documented shape. */
export const nbpPayload = (code: string, mid: number, effectiveDate = "2026-10-09") => ({
  table: "A",
  currency: code,
  code,
  rates: [{ no: "195/A/NBP/2026", effectiveDate, mid }],
});

/**
 * Stubs the NBP endpoint in the browser. The real API is not reachable from CI sandboxes,
 * so responses are fabricated in NBP's documented format; the CORS header is included so the
 * browser applies the same cross-origin rules as for the real service.
 */
export async function mockNbp(
  context: BrowserContext,
  rates: Record<string, number> | "unreachable",
): Promise<void> {
  await context.route("https://api.nbp.pl/**", async (route) => {
    if (rates === "unreachable") return route.abort("failed");
    const code =
      route
        .request()
        .url()
        .match(/\/a\/([A-Z]{3})\//)?.[1] ?? "";
    const mid = rates[code];
    if (mid === undefined) return route.fulfill({ status: 404, body: "Not Found" });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(nbpPayload(code, mid)),
    });
  });
}

export type { Page };
