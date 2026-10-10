import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { createBackup, parseBackup, serializeBackup } from "@/backup/format";
import { applyChanges, listPortfolios } from "@/storage/repository";
import sampleCli from "../golden/sample_portfolio.json";
import { A, B, portfolio, position } from "../storage/helpers";
import { renderWithApp, resetEnvironment } from "./render";

/** Captures what the app would download, without a real browser download. */
function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return `blob:test-${blobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    names.push(this.download);
  };
  return { blobs, names, lastText: () => blobs.at(-1)?.text() as Promise<string> };
}

const user = {
  click: (el: Element) => fireEvent.click(el),
  type: (el: Element, value: string) => fireEvent.change(el, { target: { value } }),
};
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const fileInput = () => document.querySelector("input[type=file]") as HTMLInputElement;
const upload = (name: string, content: string) =>
  fireEvent.change(fileInput(), {
    target: { files: [new File([content], name, { type: "application/json" })] },
  });

const nativeClick = HTMLAnchorElement.prototype.click;
beforeEach(async () => {
  await resetEnvironment();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  HTMLAnchorElement.prototype.click = nativeClick;
});

async function createPortfolioThroughUi(name: string) {
  user.click(button("New portfolio"));
  user.type(await screen.findByLabelText("Name"), name);
  user.click(button("Create"));
  await screen.findByRole("heading", { name: "Instruments & targets" });
}

function fillRow(index: number, fields: { isin: string; value: string; weight: string }) {
  user.type(screen.getAllByLabelText("ISIN")[index] as Element, fields.isin);
  user.type(screen.getAllByLabelText(/^Current value/)[index] as Element, fields.value);
  user.type(screen.getAllByLabelText("Target (%)")[index] as Element, fields.weight);
}

describe("create -> edit -> save -> reload", () => {
  it("persists a portfolio and the rebalance plan survives a reload", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    await createPortfolioThroughUi("IKE");

    user.click(button("Add instrument"));
    user.click(button("Add instrument"));
    fillRow(0, { isin: "ie00bk5bqt80", value: "45 000", weight: "60" });
    fillRow(1, { isin: B, value: "30000,00", weight: "40" });
    user.type(screen.getByLabelText("Cash to invest (PLN)"), "500");

    expect(screen.getByText(/Adds up to 100%/)).toBeInTheDocument();
    user.click(button("Save changes"));
    await screen.findByText("Portfolio saved.");

    const [stored] = await listPortfolios();
    expect(stored?.name).toBe("IKE");
    expect(stored?.cashPln).toBe("500");
    expect(stored?.positions.map((p) => [p.isin, p.targetWeight, p.valuation])).toEqual([
      [A, "0.6", { mode: "manual", valuePln: "45000" }],
      [B, "0.4", { mode: "manual", valuePln: "30000.00" }],
    ]);

    // "Reload": throw the UI away and start again from IndexedDB alone.
    cleanup();
    window.location.hash = "#/rebalance";
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Rebalance" });
    const row = (isin: string) => screen.getByText(isin).closest("tr") as HTMLElement;
    await waitFor(() =>
      expect(within(row(A)).getAllByRole("cell")[1]?.textContent).toContain("300.00"),
    );
    expect(within(row(B)).getAllByRole("cell")[1]?.textContent).toContain("200.00");
  });
});

describe("editor validation", () => {
  it("refuses to save weights that do not total 100% and leaves storage untouched", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    await createPortfolioThroughUi("P");
    user.click(button("Add instrument"));
    user.click(button("Add instrument"));
    fillRow(0, { isin: A, value: "100", weight: "60" });
    fillRow(1, { isin: B, value: "100", weight: "30" });

    expect(screen.getByText(/10\.00% left to allocate/)).toBeInTheDocument();
    user.click(button("Save changes"));
    expect(await screen.findByText("Fix these before saving")).toBeInTheDocument();
    expect(screen.getByText(/must add up to 100%/)).toBeInTheDocument();
    expect((await listPortfolios())[0]?.positions).toEqual([]);
  });

  it("flags duplicate and malformed ISINs", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    await createPortfolioThroughUi("P");
    user.click(button("Add instrument"));
    user.click(button("Add instrument"));
    fillRow(0, { isin: A, value: "1", weight: "50" });
    fillRow(1, { isin: A, value: "1", weight: "50" });
    expect(
      await screen.findByText(/Instrument 2: this ISIN is already used above/),
    ).toBeInTheDocument();

    user.type(screen.getAllByLabelText("ISIN")[1] as Element, "NOPE");
    expect(await screen.findByText(/Instrument 2: enter a valid ISIN/)).toBeInTheDocument();
  });

  it("warns about unsaved changes and can discard them", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    await createPortfolioThroughUi("P");
    expect(button("Save changes")).toBeDisabled();
    user.type(screen.getByLabelText("Portfolio name"), "Renamed");
    expect(screen.getByText("You have unsaved changes.")).toBeInTheDocument();
    user.click(button("Discard changes"));
    expect((screen.getByLabelText("Portfolio name") as HTMLInputElement).value).toBe("P");
  });
});

describe("foreign currency and NBP", () => {
  const nbp = (code: string, mid: number) =>
    new Response(
      JSON.stringify({
        table: "A",
        currency: code,
        code,
        rates: [{ no: "1/A/NBP/2026", effectiveDate: "2026-10-09", mid }],
      }),
    );

  it("converts with a manual rate and with fetched NBP rates (mocked network)", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    await createPortfolioThroughUi("FX");
    user.click(button("Add instrument"));
    user.type(screen.getAllByLabelText("ISIN")[0] as Element, A);
    user.type(screen.getByLabelText("Currency"), "EUR");
    user.type(screen.getByLabelText("Current value (EUR)"), "100");
    user.type(screen.getByLabelText("Target (%)"), "100");

    user.type(screen.getByLabelText("Rate (PLN per 1 EUR)"), "4,256");
    expect(screen.getByText("Manual rate")).toBeInTheDocument();
    expect(screen.getByText(/= PLN 425\.60/)).toBeInTheDocument();

    const fetchMock = vi.fn(async (url: string) => nbp("EUR", url.includes("/EUR/") ? 4.2635 : 0));
    vi.stubGlobal("fetch", fetchMock);
    user.click(button("Fetch NBP rates"));
    await waitFor(() =>
      expect((screen.getByLabelText("Rate (PLN per 1 EUR)") as HTMLInputElement).value).toBe(
        "4.2635",
      ),
    );
    expect(screen.getByText(/NBP mid rate, 9 Oct 2026/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    user.click(button("Save changes"));
    await screen.findByText("Portfolio saved.");
    expect((await listPortfolios())[0]?.positions[0]?.valuation).toEqual({
      mode: "fx",
      value: "100",
      currency: "EUR",
      rate: { mid: "4.2635", effectiveDate: "2026-10-09", source: "nbp" },
    });
  });

  it("keeps working when NBP is unreachable", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    await createPortfolioThroughUi("FX");
    user.click(button("Add instrument"));
    user.type(screen.getByLabelText("Currency"), "USD");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    user.click(button("Fetch NBP rates"));
    expect(await screen.findByText(/NBP is unavailable right now/)).toBeInTheDocument();
    // Still able to type a rate by hand.
    user.type(screen.getByLabelText("Rate (PLN per 1 USD)"), "3.9");
    expect((screen.getByLabelText("Rate (PLN per 1 USD)") as HTMLInputElement).value).toBe("3.9");
  });
});

describe("loading", () => {
  it("never flashes the empty state while saved portfolios are still loading", async () => {
    await applyChanges({ put: [portfolio({ id: "p1", name: "IKE" })] });
    renderWithApp(<App />);
    const seen: string[] = [];
    const watch = new MutationObserver(() => {
      if (/No portfolios yet/.test(document.body.textContent ?? "")) seen.push("empty-state");
    });
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    await screen.findByRole("heading", { name: "IKE" });
    watch.disconnect();
    expect(seen).toEqual([]);
    expect(screen.queryByText(/No portfolios yet/)).not.toBeInTheDocument();
  });
});

describe("portfolio list", () => {
  it("renames, duplicates and deletes (after confirmation)", async () => {
    await applyChanges({ put: [portfolio({ id: "p1", name: "IKE" })] });
    renderWithApp(<App />);
    const card = (name: string) => screen.findByRole("heading", { name });
    await card("IKE");
    // Closed dialogs must not linger in the accessibility tree.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    user.click(button("Duplicate"));
    expect(await card("IKE (copy)")).toBeInTheDocument();

    user.click(screen.getAllByRole("button", { name: "Rename" })[0] as Element);
    const input = await screen.findByLabelText("Name");
    user.type(input, "Brokerage");
    user.click(
      within(input.closest("form") as HTMLElement).getByRole("button", { name: "Rename" }),
    );
    expect(await card("Brokerage")).toBeInTheDocument();

    user.click(screen.getAllByRole("button", { name: "Delete" })[0] as Element);
    expect(await screen.findByText("Delete portfolio?")).toBeInTheDocument();
    expect(await listPortfolios()).toHaveLength(2); // nothing removed before confirming
    const confirm = screen.getAllByRole("button", { name: "Delete" }).at(-1) as Element;
    user.click(confirm);
    await waitFor(async () => expect(await listPortfolios()).toHaveLength(1));
  });

  it("demo data is never written to storage unless the user saves it", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    user.click(button("Try the demo"));
    expect((await screen.findAllByText("SXR8")).length).toBeGreaterThan(0);
    expect(await listPortfolios()).toEqual([]);

    user.click(button("Save as my portfolio"));
    await waitFor(async () => expect(await listPortfolios()).toHaveLength(1));
    expect((await listPortfolios())[0]?.positions).toHaveLength(4);
  });
});

describe("backup, import and export", () => {
  const two = [
    portfolio({ id: "p1", name: "IKE" }),
    portfolio({
      id: "p2",
      name: "IKZE",
      positions: [position(A, "1", "1000", { label: "VWCE" })],
    }),
  ];

  it("export -> delete everything -> import restores all saved information", async () => {
    await applyChanges({ put: two });
    const before = await listPortfolios();
    const downloads = captureDownloads();

    window.location.hash = "#/data";
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Data & privacy" });

    user.click(button("Export full backup (JSON)"));
    const text = await downloads.lastText();
    expect(downloads.names.at(-1)).toMatch(/^driftless-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(parseBackup(text).portfolios).toEqual(before);

    user.click(button("Delete all data on this device"));
    user.click(
      screen.getAllByRole("button", { name: "Delete all data on this device" }).at(-1) as Element,
    );
    await waitFor(async () => expect(await listPortfolios()).toEqual([]));

    upload("backup.json", text);
    expect(await screen.findByText(/Preview: backup\.json/)).toBeInTheDocument();
    user.click(button("Import"));
    await waitFor(async () => expect(await listPortfolios()).toEqual(before));
  });

  it("rejects malformed files without touching existing data", async () => {
    await applyChanges({ put: two });
    const before = await listPortfolios();
    window.location.hash = "#/data";
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Data & privacy" });

    upload("bad.json", "{not json");
    expect(await screen.findByText("The file is not valid JSON.")).toBeInTheDocument();

    const broken = JSON.parse(serializeBackup(createBackup(two, new Date())));
    broken.portfolios[0].cashPln = "-1";
    upload("broken.json", JSON.stringify(broken));
    expect(await screen.findByText(/damaged or has an unexpected structure/)).toBeInTheDocument();

    const unbalanced = JSON.parse(serializeBackup(createBackup(two, new Date())));
    unbalanced.portfolios[0].positions[0].targetWeight = "0.1";
    upload("unbalanced.json", JSON.stringify(unbalanced));
    expect(await screen.findByText(/A portfolio in the file is invalid/)).toBeInTheDocument();

    upload("other.json", JSON.stringify({ hello: "world" }));
    expect(await screen.findByText(/neither a Driftless backup nor/)).toBeInTheDocument();

    expect(await listPortfolios()).toEqual(before);
  });

  it("asks before overwriting and does nothing if the user cancels", async () => {
    const local = portfolio({
      id: "p1",
      name: "IKE",
      cashPln: "1",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await applyChanges({ put: [local] });
    const incoming = { ...local, cashPln: "999", updatedAt: "2026-10-09T00:00:00.000Z" };
    window.location.hash = "#/data";
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Data & privacy" });

    upload("b.json", serializeBackup(createBackup([incoming], new Date())));
    await screen.findByText(/Preview: b\.json/);
    user.type(screen.getByLabelText("If a portfolio already exists"), "replace");
    expect(screen.getByText("Replaces the local one")).toBeInTheDocument();

    user.click(button("Import"));
    expect(await screen.findByText("Overwrite existing portfolios?")).toBeInTheDocument();
    user.click(button("Cancel"));
    expect((await listPortfolios())[0]?.cashPln).toBe("1");

    user.click(button("Import"));
    user.click(await screen.findByRole("button", { name: "Overwrite" }));
    await waitFor(async () => expect((await listPortfolios())[0]?.cashPln).toBe("999"));
  });

  it("'keep both' imports copies and never overwrites", async () => {
    const local = portfolio({ id: "p1", name: "IKE" });
    await applyChanges({ put: [local] });
    window.location.hash = "#/data";
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Data & privacy" });

    upload("b.json", serializeBackup(createBackup([local], new Date())));
    await screen.findByText(/Preview: b\.json/);
    user.type(screen.getByLabelText("If a portfolio already exists"), "copy");
    user.click(button("Import"));
    await waitFor(async () => expect(await listPortfolios()).toHaveLength(2));
    expect((await listPortfolios()).map((p) => p.name).sort()).toEqual(["IKE", "IKE (import)"]);
  });

  it("imports and exports the Driftless CLI portfolio.json format", async () => {
    const downloads = captureDownloads();
    window.location.hash = "#/data";
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Data & privacy" });

    upload("sample_portfolio.json", JSON.stringify(sampleCli));
    expect(await screen.findByText(/CLI portfolio file detected/)).toBeInTheDocument();
    expect((screen.getByLabelText("Name of the new portfolio") as HTMLInputElement).value).toBe(
      "sample_portfolio",
    );
    user.click(button("Import as new portfolio"));
    await waitFor(async () => expect(await listPortfolios()).toHaveLength(1));

    user.click(
      await screen.findByRole("button", { name: /Export sample_portfolio as CLI portfolio\.json/ }),
    );
    expect(JSON.parse(await downloads.lastText())).toEqual(sampleCli);
    expect(downloads.names.at(-1)).toBe("portfolio.json");
  });
});

describe("plan export", () => {
  it("downloads the purchase plan as CSV", async () => {
    const downloads = captureDownloads();
    window.location.hash = "#/rebalance";
    renderWithApp(<App />, { demo: true });
    await screen.findByText("IS3N");
    user.click(button("Export plan (CSV)"));
    const csv = await downloads.lastText();
    expect(csv).toContain("IE00BKM4GZ66,IS3N,1200.00,12.00,15.00,200.00");
    expect(downloads.names.at(-1)).toMatch(/^driftless-plan-.*\.csv$/);
  });
});
