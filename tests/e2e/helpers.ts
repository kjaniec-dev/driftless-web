import { expect, type Page } from "@playwright/test";

/** The Driftless CLI's four-ETF example (examples/portfolio.example.json). */
export const FOUR_ETF = [
  { isin: "IE00B5BMR087", label: "SXR8", value: "3400", weight: "30" },
  { isin: "IE0006WW1TQ4", label: "EXUS", value: "4300", weight: "40" },
  { isin: "IE00BKM4GZ66", label: "IS3N", value: "1200", weight: "15" },
  { isin: "IE00B4ND3602", label: "EGLN", value: "1100", weight: "15" },
];

export interface InstrumentInput {
  isin: string;
  label?: string;
  value: string;
  weight: string;
  currency?: "EUR" | "USD" | "GBP" | "CHF";
  rate?: string;
}

/** Client-side navigation (the app uses hash routes); keeps the page, and any state, alive. */
export async function go(page: Page, route: string): Promise<void> {
  await page.evaluate((r) => {
    window.location.hash = r;
  }, route);
}

export async function openStart(page: Page): Promise<void> {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Driftless" })).toBeVisible();
}

/** Start screen -> "New portfolio" dialog -> lands in the editor. */
export async function createPortfolio(page: Page, name: string): Promise<void> {
  await openStart(page);
  await page.getByRole("button", { name: "New portfolio" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Instruments & targets" }),
  ).toBeVisible();
}

export async function addInstrument(page: Page, n: number, input: InstrumentInput): Promise<void> {
  await page.getByRole("button", { name: "Add instrument" }).click();
  const row = page.locator("li").filter({
    has: page.getByRole("heading", { name: `Instrument ${n}`, exact: true }),
  });
  await row.getByLabel("ISIN", { exact: true }).fill(input.isin);
  if (input.label) await row.getByLabel("Label (optional)").fill(input.label);
  if (input.currency) await row.getByLabel("Currency").selectOption(input.currency);
  await row.getByLabel(/^Current value/).fill(input.value);
  if (input.rate) await row.getByLabel(/^Rate \(PLN per 1/).fill(input.rate);
  await row.getByLabel("Target (%)").fill(input.weight);
}

export async function setCash(page: Page, amount: string): Promise<void> {
  await page.getByLabel("Cash to invest (PLN)").fill(amount);
}

export async function save(page: Page): Promise<void> {
  const saveButton = page.getByRole("button", { name: "Save changes" });
  await saveButton.click();
  // The button is enabled only while there are unsaved changes, so "disabled" means persisted
  // (more robust than a toast, which a previous save may still be showing).
  await expect(saveButton).toBeDisabled();
  await expect(page.getByText("You have unsaved changes.")).toBeHidden();
}

/** A fully saved portfolio, ready to use. */
export async function seedPortfolio(
  page: Page,
  name = "IKE",
  instruments: InstrumentInput[] = FOUR_ETF,
  cash = "500",
): Promise<void> {
  await createPortfolio(page, name);
  for (const [i, instrument] of instruments.entries()) await addInstrument(page, i + 1, instrument);
  await setCash(page, cash);
  await save(page);
}

/** "PLN 1,234.50" / "1 234,50 zł" -> 1234.5 */
export const toNumber = (text: string | null): number => {
  const digits = (text ?? "").replace(/[^\d,.-]/g, "");
  const normalised =
    digits.includes(",") && !digits.includes(".")
      ? digits.replace(",", ".")
      : digits.replace(/,/g, "");
  return Number(normalised);
};

/** Buy amounts by instrument label (or ISIN when unlabeled) from the rebalance table. */
export async function readBuys(page: Page): Promise<Record<string, number>> {
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible();
  // One round trip: reading hundreds of cells through locators is slow and would hide real timings.
  const rows = await table.evaluate((t) =>
    [...t.querySelectorAll("tbody tr")].map((tr) => {
      const cells = tr.querySelectorAll("td");
      return [
        cells[0]?.querySelector("span > span")?.textContent ?? "",
        cells[1]?.textContent ?? "",
      ];
    }),
  );
  return Object.fromEntries(rows.map(([name, buy]) => [(name ?? "").trim(), toNumber(buy ?? "")]));
}

/** The MetricCard whose title is `title` (title -> header row -> card). */
export const metric = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).locator("xpath=../..");

import fs from "node:fs/promises";
import type { Download } from "@playwright/test";

export async function readDownload(download: Download): Promise<string> {
  return fs.readFile((await download.path()) as string, "utf8");
}

/** Exports the full backup through the always-visible sidebar button (desktop) or the Data screen. */
export async function exportBackup(page: Page): Promise<string> {
  await go(page, "/data");
  await expect(page.getByRole("heading", { level: 1, name: "Data & privacy" })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export full backup (JSON)" }).click(),
  ]);
  return readDownload(download);
}

export async function uploadFile(page: Page, name: string, content: string): Promise<void> {
  await page.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
}

/** Simulates "clear site data": deletes the IndexedDB database the app uses. */
export async function wipeIndexedDb(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("driftless");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      }),
  );
}
