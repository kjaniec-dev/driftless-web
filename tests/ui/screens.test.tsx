import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { App } from "@/App";
import { RebalanceScreen } from "@/features/rebalance/RebalanceScreen";
import { I18nProvider, type Lang } from "@/i18n";

const withI18n = (ui: ReactNode, lang: Lang = "en") => (
  <I18nProvider initial={lang}>{ui}</I18nProvider>
);

/** Text of the "Buy" column for an instrument row. */
function buyFor(label: string): string {
  const row = screen.getByText(label).closest("tr");
  if (!row) throw new Error(`No row for ${label}`);
  return within(row).getAllByRole("cell")[1]?.textContent ?? "";
}
const digits = (s: string) => s.replace(/[^\d,.]/g, "");

describe("RebalanceScreen", () => {
  it("shows the buy-only plan for the demo portfolio (matches the CLI case)", () => {
    render(withI18n(<RebalanceScreen />));
    expect(digits(buyFor("IS3N"))).toBe("200.00");
    expect(digits(buyFor("EGLN"))).toBe("300.00");
    expect(digits(buyFor("SXR8"))).toBe("0.00");
    expect(screen.getByText(/limited by the available cash/i)).toBeInTheDocument();
    expect(screen.getByText(/not an order for a number of units/i)).toBeInTheDocument();
  });

  it("recalculates when the cash changes and accepts Polish number formatting", () => {
    render(withI18n(<RebalanceScreen />));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1 000,50" } });
    const total = ["IS3N", "EGLN", "SXR8", "EXUS"].reduce(
      (sum, l) => sum + Number(digits(buyFor(l)).replace(",", "")),
      0,
    );
    expect(total).toBeCloseTo(1000.5, 2);
  });

  it("shows a validation message and no plan for an invalid amount", () => {
    render(withI18n(<RebalanceScreen />));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
    expect(screen.getByText("Enter a valid non-negative amount.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains when nothing can be purchased", () => {
    render(withI18n(<RebalanceScreen />));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0" } });
    expect(screen.getByText(/No purchases suggested/i)).toBeInTheDocument();
  });

  it("renders in Polish", () => {
    render(withI18n(<RebalanceScreen />, "pl"));
    expect(screen.getByRole("heading", { name: "Rebalansing" })).toBeInTheDocument();
    expect(screen.getByText(/Zakupy ograniczone dostępną gotówką/)).toBeInTheDocument();
  });
});

describe("App shell", () => {
  it("switches language and exposes an accessible theme toggle", () => {
    window.location.hash = "#/data";
    render(withI18n(<App />));
    expect(screen.getByRole("heading", { name: "Data & privacy" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "PL" }));
    expect(screen.getByRole("heading", { name: "Dane i prywatność" })).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Przełącz tryb ciemny" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveClass("dark");
    document.documentElement.classList.remove("dark");
  });
});
