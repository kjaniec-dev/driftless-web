import { Card, CardContent, SelectField } from "@kjaniec-dev/ui";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { multiplyToGrosz, normalizeDecimal } from "@/core/decimal";
import { useI18n } from "@/i18n";
import { formatDate, formatPln } from "@/lib/format";
import type { DraftRow } from "@/storage/draft";
import { FX_CURRENCIES, type FxCurrency } from "@/storage/model";
import type { StoredIssue } from "@/storage/validate";

type RowIssue = Extract<StoredIssue, { index: number }>;

/**
 * One instrument. A card on every screen size: single column on phones, a 4-column grid
 * on wide screens, so the same markup serves mobile and desktop.
 */
export function InstrumentRow({
  row,
  index,
  issues,
  showAllErrors,
  duplicate,
  onChange,
  onRemove,
}: {
  row: DraftRow;
  index: number;
  issues: readonly RowIssue[];
  /** Before the first save attempt only fields with content show their errors. */
  showAllErrors: boolean;
  duplicate: boolean;
  onChange: (changes: Partial<DraftRow>) => void;
  onRemove: () => void;
}) {
  const { t, lang, format } = useI18n();
  const has = (code: RowIssue["code"]) => issues.some((i) => i.code === code);
  const show = (code: RowIssue["code"], filled: boolean) => has(code) && (showAllErrors || filled);

  const isForeign = row.mode === "fx";
  const currencyValue = isForeign ? row.currency : "PLN";
  const valueCanonical = normalizeDecimal(row.value.trim() === "" ? "0" : row.value);
  const rateCanonical = normalizeDecimal(row.rate);
  const plnPreview =
    isForeign && valueCanonical && rateCanonical && Number(rateCanonical) > 0
      ? formatPln(Number(multiplyToGrosz(valueCanonical, rateCanonical)), lang)
      : null;

  const isinError = duplicate
    ? format(t.issues.duplicate_isin, { n: index + 1 })
    : show("position_isin", row.isin.trim() !== "")
      ? format(t.issues.position_isin, { n: index + 1 })
      : undefined;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{format(t.edit.rowTitle, { n: index + 1 })}</h3>
          <Button
            size="sm"
            variant="destructive"
            onClick={onRemove}
            aria-label={`${t.edit.remove} ${index + 1}`}
          >
            {t.edit.remove}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={t.edit.isin}
            hint={t.edit.isinHint}
            value={row.isin}
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            error={isinError}
            onChange={(e) => onChange({ isin: e.target.value.toUpperCase() })}
          />
          <Field
            label={t.edit.label}
            value={row.label}
            maxLength={100}
            error={
              show("position_text", true)
                ? format(t.issues.position_text, { n: index + 1 })
                : undefined
            }
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <Field
            label={t.edit.ticker}
            value={row.ticker}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => onChange({ ticker: e.target.value })}
          />
          <Field
            label={t.edit.weight}
            hint={t.edit.weightHint}
            inputMode="decimal"
            autoComplete="off"
            value={row.weightPct}
            error={
              show("position_weight", row.weightPct.trim() !== "")
                ? format(t.issues.position_weight, { n: index + 1 })
                : undefined
            }
            onChange={(e) => onChange({ weightPct: e.target.value })}
          />

          <SelectField
            label={t.edit.currency}
            value={currencyValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "PLN") onChange({ mode: "manual" });
              else onChange({ mode: "fx", currency: v as FxCurrency });
            }}
          >
            <option value="PLN">PLN</option>
            {FX_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <Field
            label={format(t.edit.value, { currency: currencyValue })}
            inputMode="decimal"
            autoComplete="off"
            value={row.value}
            error={
              show("position_amount", row.value.trim() !== "")
                ? format(t.issues.position_amount, { n: index + 1 })
                : undefined
            }
            onChange={(e) => onChange({ value: e.target.value })}
          />
          {isForeign && (
            <div className="sm:col-span-2">
              <Field
                label={format(t.edit.rate, { currency: row.currency })}
                inputMode="decimal"
                autoComplete="off"
                value={row.rate}
                hint={
                  row.rateSource === "nbp" && row.rateDate
                    ? format(t.edit.rateNbp, { date: formatDate(row.rateDate, lang) })
                    : t.edit.rateManual
                }
                error={
                  show("position_rate", row.rate.trim() !== "")
                    ? format(t.issues.position_rate, { n: index + 1 })
                    : undefined
                }
                // Typing a rate makes it a manual one: it no longer matches the NBP publication.
                onChange={(e) =>
                  onChange({ rate: e.target.value, rateSource: "manual", rateDate: null })
                }
              />
              {plnPreview && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(t.edit.plnValue, { amount: plnPreview })}
                </p>
              )}
            </div>
          )}
        </div>

        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="text-sm font-semibold">{t.edit.unitPriceTitle}</legend>
          <p className="text-xs text-muted-foreground">{t.edit.unitPriceHint}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label={t.edit.unitPriceCurrency}
              value={row.priceCurrency}
              onChange={(e) =>
                onChange({
                  priceCurrency: e.target.value as DraftRow["priceCurrency"],
                  // A rate belongs to one currency: switching currency drops the old one.
                  priceRate: "",
                  priceRateSource: "manual",
                  priceRateDate: null,
                })
              }
            >
              <option value="PLN">PLN</option>
              {FX_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            <Field
              label={format(t.edit.unitPrice, { currency: row.priceCurrency })}
              inputMode="decimal"
              autoComplete="off"
              value={row.price}
              error={
                show("position_price", row.price.trim() !== "")
                  ? format(t.issues.position_price, { n: index + 1 })
                  : undefined
              }
              onChange={(e) => onChange({ price: e.target.value })}
            />
            {row.priceCurrency !== "PLN" && (
              <Field
                label={format(t.edit.unitPriceRate, { currency: row.priceCurrency })}
                inputMode="decimal"
                autoComplete="off"
                value={row.priceRate}
                hint={
                  row.priceRateSource === "nbp" && row.priceRateDate
                    ? format(t.edit.rateNbp, { date: formatDate(row.priceRateDate, lang) })
                    : t.edit.rateManual
                }
                onChange={(e) =>
                  onChange({
                    priceRate: e.target.value,
                    priceRateSource: "manual",
                    priceRateDate: null,
                  })
                }
              />
            )}
            <Field
              label={t.edit.unitPriceDate}
              hint={t.edit.unitPriceDateHint}
              type="date"
              value={row.priceDate}
              onChange={(e) => onChange({ priceDate: e.target.value })}
            />
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
