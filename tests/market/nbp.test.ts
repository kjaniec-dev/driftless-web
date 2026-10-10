import { describe, expect, it, vi } from "vitest";
import { applyNbpRates, draftCurrencies } from "@/market/apply";
import { fetchNbpRate, fetchNbpRates, NbpError, parseNbpResponse } from "@/market/nbp";
import { draftFromStored, emptyRow } from "@/storage/draft";
import { portfolio } from "../storage/helpers";

// NOTE: api.nbp.pl was not reachable from the development sandbox, so these tests use
// responses shaped like NBP's documented table-A payload. They do not prove the live
// API or its CORS headers behave this way.
const payload = (over: Record<string, unknown> = {}) => ({
  table: "A",
  currency: "euro",
  code: "EUR",
  rates: [{ no: "195/A/NBP/2026", effectiveDate: "2026-10-09", mid: 4.2635 }],
  ...over,
});
const respond = (body: unknown, init: ResponseInit = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), init);
const fetchReturning = (body: unknown, init?: ResponseInit) =>
  vi.fn(async () => respond(body, init)) as unknown as typeof fetch;
const errorCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof NbpError ? e.code : "other";
  }
  return "none";
};

describe("parseNbpResponse", () => {
  it("returns the mid rate as exact text with its publication date", () => {
    expect(parseNbpResponse(payload(), "EUR")).toEqual({
      currency: "EUR",
      mid: "4.2635",
      effectiveDate: "2026-10-09",
    });
  });

  it("takes the newest entry when several are returned", () => {
    const rates = [
      { effectiveDate: "2026-10-08", mid: 4.2 },
      { effectiveDate: "2026-10-09", mid: 4.3 },
    ];
    expect(parseNbpResponse(payload({ rates }), "EUR").mid).toBe("4.3");
  });

  it.each([
    ["wrong table", { table: "B" }],
    ["other currency", { code: "USD" }],
    ["no rates", { rates: [] }],
    ["rates not an array", { rates: {} }],
    ["string mid", { rates: [{ effectiveDate: "2026-10-09", mid: "4.26" }] }],
    ["zero mid", { rates: [{ effectiveDate: "2026-10-09", mid: 0 }] }],
    ["negative mid", { rates: [{ effectiveDate: "2026-10-09", mid: -4 }] }],
    ["absurd mid", { rates: [{ effectiveDate: "2026-10-09", mid: 1e9 }] }],
    ["bad date", { rates: [{ effectiveDate: "09.10.2026", mid: 4.2 }] }],
    ["missing date", { rates: [{ mid: 4.2 }] }],
  ])("rejects %s", (_name, over) => {
    expect(() => parseNbpResponse(payload(over), "EUR")).toThrow(NbpError);
  });

  it("rejects non-objects", () => {
    for (const v of [null, "x", 5, []]) expect(() => parseNbpResponse(v, "EUR")).toThrow(NbpError);
  });
});

describe("fetchNbpRate", () => {
  it("requests only the currency code, without credentials or referrer", async () => {
    const fetchMock = fetchReturning(payload());
    const rate = await fetchNbpRate("EUR", { fetch: fetchMock });
    expect(rate.mid).toBe("4.2635");

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.nbp.pl/api/exchangerates/rates/a/EUR/?format=json");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.body).toBeUndefined();
  });

  it("maps failures to typed errors", async () => {
    expect(
      await errorCode(fetchNbpRate("EUR", { fetch: fetchReturning("nope", { status: 404 }) })),
    ).toBe("http");
    expect(
      await errorCode(fetchNbpRate("EUR", { fetch: fetchReturning("<html>", { status: 200 }) })),
    ).toBe("bad_response");
    expect(
      await errorCode(fetchNbpRate("EUR", { fetch: fetchReturning(payload({ code: "GBP" })) })),
    ).toBe("bad_response");
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await errorCode(fetchNbpRate("EUR", { fetch: offline }))).toBe("network");
  });

  it("rejects currencies outside the allowlist before any request", async () => {
    const fetchMock = fetchReturning(payload());
    expect(await errorCode(fetchNbpRate("../x" as never, { fetch: fetchMock }))).toBe(
      "unsupported_currency",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out", async () => {
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      })) as unknown as typeof fetch;
    expect(await errorCode(fetchNbpRate("EUR", { fetch: hanging, timeoutMs: 20 }))).toBe("timeout");
  });
});

describe("fetchNbpRates", () => {
  it("fetches each currency once and keeps partial results", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/EUR/")
        ? respond(payload())
        : url.includes("/USD/")
          ? respond(payload({ code: "USD", rates: [{ effectiveDate: "2026-10-09", mid: 3.9 }] }))
          : respond("", { status: 500 }),
    ) as unknown as typeof fetch;

    const { rates, errors } = await fetchNbpRates(["EUR", "USD", "EUR", "GBP"], {
      fetch: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rates.EUR?.mid).toBe("4.2635");
    expect(rates.USD?.mid).toBe("3.9");
    expect(errors.GBP?.code).toBe("http");
    expect(rates.GBP).toBeUndefined();
  });
});

describe("applying rates to a draft", () => {
  it("fills foreign rows only, marking them as NBP rates with their publication date", () => {
    const draft = draftFromStored(portfolio({ positions: [] }));
    draft.rows = [
      { ...emptyRow(), mode: "fx", currency: "EUR", rate: "1", rateSource: "manual" },
      { ...emptyRow(), mode: "fx", currency: "USD" },
      { ...emptyRow(), mode: "manual", currency: "EUR" },
    ];
    expect(draftCurrencies(draft)).toEqual(["EUR", "USD"]);

    const next = applyNbpRates(draft, {
      EUR: { currency: "EUR", mid: "4.2635", effectiveDate: "2026-10-09" },
    });
    expect(next.rows[0]).toMatchObject({
      rate: "4.2635",
      rateSource: "nbp",
      rateDate: "2026-10-09",
    });
    expect(next.rows[1]?.rate).toBe(""); // no rate fetched for USD: unchanged, still manual
    expect(next.rows[2]?.rate).toBe(""); // PLN row untouched
    expect(draft.rows[0]?.rate).toBe("1"); // input not mutated
  });
});
