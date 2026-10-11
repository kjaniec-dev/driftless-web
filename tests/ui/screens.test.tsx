import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "@/App";
import { RebalanceScreen } from "@/features/rebalance/RebalanceScreen";
import { renderWithApp, resetEnvironment } from "./render";

beforeEach(resetEnvironment);

/** Text of the "Buy" column (second cell) for an instrument row. */
function buyFor(label: string): string {
  const row = screen.getAllByText(label)[0]?.closest("tr");
  if (!row) throw new Error(`No row for ${label}`);
  return within(row).getAllByRole("cell")[1]?.textContent ?? "";
}
const digits = (s: string) => s.replace(/[^\d,.]/g, "");
const cashField = () => screen.getByRole("textbox", { name: /new cash to invest/i });

describe("RebalanceScreen (demo portfolio)", () => {
  it("shows the buy-only plan that matches the CLI reference case", async () => {
    renderWithApp(<RebalanceScreen />, { demo: true });
    await waitFor(() => expect(screen.getAllByText("IS3N")[0]).toBeInTheDocument());
    expect(digits(buyFor("IS3N"))).toBe("200.00");
    expect(digits(buyFor("EGLN"))).toBe("300.00");
    expect(digits(buyFor("SXR8"))).toBe("0.00");
    expect(screen.getByText(/limited by the available cash/i)).toBeInTheDocument();
    expect(screen.getByText(/turns it into a number of units/i)).toBeInTheDocument();
  });

  it("recalculates when the cash changes and accepts Polish number formatting", async () => {
    renderWithApp(<RebalanceScreen />, { demo: true });
    await waitFor(() => expect(screen.getAllByText("IS3N")[0]).toBeInTheDocument());
    fireEvent.change(cashField(), { target: { value: "1 000,50" } });
    const total = ["IS3N", "EGLN", "SXR8", "EXUS"].reduce(
      (sum, l) => sum + Number(digits(buyFor(l)).replace(",", "")),
      0,
    );
    expect(total).toBeCloseTo(1000.5, 2);
  });

  it("offers to go back to the saved cash amount without changing the portfolio", async () => {
    renderWithApp(<RebalanceScreen />, { demo: true });
    await waitFor(() => expect(screen.getAllByText("IS3N")[0]).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /use saved amount/i })).not.toBeInTheDocument();
    fireEvent.change(cashField(), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /use saved amount/i }));
    expect((cashField() as HTMLInputElement).value).toBe("500");
  });

  it("shows a validation message and no plan for an invalid amount", async () => {
    renderWithApp(<RebalanceScreen />, { demo: true });
    await waitFor(() => expect(screen.getAllByText("IS3N")[0]).toBeInTheDocument());
    fireEvent.change(cashField(), { target: { value: "abc" } });
    expect(screen.getByText("Enter a valid non-negative amount.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains when nothing can be purchased", async () => {
    renderWithApp(<RebalanceScreen />, { demo: true });
    await waitFor(() => expect(screen.getAllByText("IS3N")[0]).toBeInTheDocument());
    fireEvent.change(cashField(), { target: { value: "0" } });
    expect(screen.getByText(/No purchases suggested/i)).toBeInTheDocument();
  });

  it("renders in Polish", async () => {
    renderWithApp(<RebalanceScreen />, { demo: true, lang: "pl" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Rebalansing" })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Zakupy ograniczone dostępną gotówką/)).toBeInTheDocument();
  });
});

describe("App shell", () => {
  it("switches language and exposes an accessible theme toggle", async () => {
    window.location.hash = "#/data";
    renderWithApp(<App />);
    expect(await screen.findByRole("heading", { name: "Data & privacy" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "PL" }));
    expect(screen.getByRole("heading", { name: "Dane i prywatność" })).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Przełącz tryb ciemny" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("always shows where data lives and how to back it up", async () => {
    renderWithApp(<App />);
    await screen.findByRole("heading", { name: "Welcome to Driftless" });
    expect(screen.getAllByText(/stored only on this device/i).length).toBeGreaterThan(0);
    // No portfolios yet: nothing to export.
    for (const b of screen.getAllByRole("button", { name: "Export backup" }))
      expect(b).toBeDisabled();
  });
});
