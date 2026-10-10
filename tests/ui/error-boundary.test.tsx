import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { I18nProvider } from "@/i18n";
import { applyChanges } from "@/storage/repository";
import { portfolio } from "../storage/helpers";
import { resetEnvironment } from "./render";

function Bomb(): never {
  throw new Error("boom: IE00BK5BQT80 holds 123456.78 PLN"); // a message that WOULD be sensitive
}

beforeEach(resetEnvironment);
afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("shows a calm fallback instead of a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <I18nProvider initial="en">
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(/saved portfolios are not affected/i)).toBeInTheDocument();
    // The failing message must not leak into the page.
    expect(document.body.textContent).not.toContain("123456.78");
  });

  it("never sends the error anywhere (no network, console only)", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    const beaconSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    Object.defineProperty(navigator, "sendBeacon", { value: beaconSpy, configurable: true });
    render(
      <I18nProvider initial="en">
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </I18nProvider>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
    expect(logged.mock.calls.some((c) => String(c[0]).includes("kept local"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("still lets the user download a backup straight from storage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await applyChanges({ put: [portfolio({ id: "p1", name: "IKE" })] });
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    const native = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => {};

    render(
      <I18nProvider initial="en">
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    const backup = JSON.parse((await blobs[0]?.text()) ?? "{}");
    expect(backup.portfolios.map((p: { name: string }) => p.name)).toEqual(["IKE"]);
    HTMLAnchorElement.prototype.click = native;
  });
});
