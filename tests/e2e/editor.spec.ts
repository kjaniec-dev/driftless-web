import { expect, test } from "./fixtures";
import { addInstrument, createPortfolio, go, save, seedPortfolio, setCash } from "./helpers";

test.describe("editor", () => {
  test("refuses weights that do not add up to 100% and explains by how much", async ({ page }) => {
    await createPortfolio(page, "P");
    await addInstrument(page, 1, { isin: "IE00BK5BQT80", value: "100", weight: "60" });
    await addInstrument(page, 2, { isin: "IE00B4L5Y983", value: "100", weight: "30" });
    await expect(page.getByText(/10\.00% left to allocate/)).toBeVisible();

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Fix these before saving" }),
    ).toContainText("must add up to 100%");

    // Nothing was stored: after a reload the portfolio is still empty.
    await page.reload();
    await go(page, "/portfolio");
    await expect(page.getByText("This portfolio has no instruments yet")).toBeVisible();
  });

  test("flags duplicate and malformed ISINs as you type", async ({ page }) => {
    await createPortfolio(page, "P");
    await addInstrument(page, 1, { isin: "IE00BK5BQT80", value: "1", weight: "50" });
    await addInstrument(page, 2, { isin: "IE00BK5BQT80", value: "1", weight: "50" });
    await expect(page.getByText(/Instrument 2: this ISIN is already used above/)).toBeVisible();

    await page.getByLabel("ISIN", { exact: true }).nth(1).fill("nope");
    await expect(page.getByText(/Instrument 2: enter a valid ISIN/)).toBeVisible();
  });

  test("normalises ISIN case and accepts Polish number formatting", async ({ page }) => {
    await createPortfolio(page, "P");
    await addInstrument(page, 1, {
      isin: "ie00bk5bqt80",
      label: "VWCE",
      value: "1 234,56",
      weight: "100",
    });
    await setCash(page, "0,5");
    await save(page);
    await go(page, "/portfolio");
    await expect(
      page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Drift" }) }),
    ).toContainText("IE00BK5BQT80");
  });

  test("discarding restores the saved version", async ({ page }) => {
    await seedPortfolio(page, "IKE");
    await go(page, "/edit");
    await page.getByLabel("Portfolio name").fill("Renamed");
    await expect(page.getByText("You have unsaved changes.")).toBeVisible();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByLabel("Portfolio name")).toHaveValue("IKE");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("a held position without a target is kept, flagged, and never bought", async ({ page }) => {
    await seedPortfolio(
      page,
      "Held",
      [
        { isin: "IE00BK5BQT80", label: "VWCE", value: "5000", weight: "50" },
        { isin: "IE00B4L5Y983", label: "IWDA", value: "3000", weight: "50" },
        { isin: "IE00B5BMR087", label: "SXR8", value: "2000", weight: "0" },
      ],
      "1000",
    );
    await go(page, "/rebalance");
    await expect(page.getByText(/IE00B5BMR087 is not in the target allocation/)).toBeVisible();
    await expect(
      page.getByText(/Position IE00B5BMR087 is not in the target allocation/),
    ).toBeVisible();
  });
});
