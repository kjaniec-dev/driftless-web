import { Alert, DataTable, MetricCard } from "@kjaniec-dev/ui";
import { useMemo } from "react";
import { unitPlanToCsv } from "@/backup/csv";
import { dateStamp, downloadText } from "@/backup/files";
import { Button } from "@/components/Button";
import { computeUnitPlan, type RebalancePlan, type UnitWarning } from "@/core";
import { useI18n } from "@/i18n";
import { ageInDays, STALE_AFTER_DAYS } from "@/lib/age";
import { formatDate, formatPercent, formatPln, formatPp } from "@/lib/format";
import { toUnitInputs } from "@/storage/convert";
import type { StoredPortfolio } from "@/storage/model";

/** The amount plan turned into whole units at the prices stored with the portfolio. */
export function UnitPlanView({
  plan,
  portfolio,
}: {
  plan: RebalancePlan;
  portfolio: StoredPortfolio;
}) {
  const { t, lang, format } = useI18n();
  const hasPrices = portfolio.positions.some((p) => p.price !== undefined);

  const unitPlan = useMemo(() => {
    const { prices, commission } = toUnitInputs(portfolio);
    return computeUnitPlan(plan, prices, commission);
  }, [plan, portfolio]);

  const positions = new Map(portfolio.positions.map((p) => [p.isin, p]));
  const nameOf = (isin: string) => {
    const label = unitPlan.orders.find((o) => o.isin === isin)?.label;
    return label ?? isin;
  };

  const now = new Date();
  const priceNotes = unitPlan.orders.flatMap((o) => {
    const price = positions.get(o.isin)?.price;
    if (!price || o.units === 0) return [];
    if (!price.quotedOn) return [format(t.rebalance.priceUndated, { name: nameOf(o.isin) })];
    const days = ageInDays(price.quotedOn, now);
    return days > STALE_AFTER_DAYS
      ? [
          format(t.rebalance.priceStale, {
            name: nameOf(o.isin),
            date: formatDate(price.quotedOn, lang),
            days,
          }),
        ]
      : [];
  });

  const describe = (w: UnitWarning) =>
    w.code === "no_price"
      ? format(t.rebalance.unitWarnings.noPrice, { name: nameOf(w.isin) })
      : format(t.rebalance.unitWarnings.highFee, {
          name: nameOf(w.isin),
          share: formatPercent(w.share, lang),
        });

  const exportCsv = () =>
    downloadText(
      `driftless-units-${dateStamp(new Date())}.csv`,
      "text/csv",
      unitPlanToCsv(unitPlan, portfolio),
    );

  return (
    <section aria-labelledby="units-heading" className="space-y-4">
      <h2 id="units-heading" className="text-lg font-bold">
        {t.rebalance.unitsTitle}
      </h2>

      {!hasPrices ? (
        <Alert variant="info">{t.rebalance.unitsEmpty}</Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.rebalance.unitsIntro}</p>

          {[...unitPlan.warnings.map(describe), ...priceNotes].map((message) => (
            <Alert key={message} variant="warning">
              {message}
            </Alert>
          ))}

          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard title={t.rebalance.unitsSpent} value={formatPln(unitPlan.unitsPln, lang)} />
            <MetricCard title={t.rebalance.unitsFees} value={formatPln(unitPlan.feesPln, lang)} />
            <MetricCard
              title={t.rebalance.unitsLeftover}
              value={formatPln(unitPlan.leftoverPln, lang)}
            />
          </div>

          <DataTable
            tabIndex={0}
            role="region"
            aria-label={t.rebalance.unitsTableLabel}
            data={[...unitPlan.orders]}
            getRowKey={(o) => o.isin}
            columns={[
              {
                header: t.portfolio.instrument,
                accessor: (o) => (
                  <span className="flex flex-col">
                    <span className="font-semibold">{o.label ?? o.isin}</span>
                    {o.label && (
                      <span className="font-mono text-xs text-muted-foreground">{o.isin}</span>
                    )}
                  </span>
                ),
              },
              {
                header: t.rebalance.colUnits,
                align: "right",
                accessor: (o) => <strong>{o.units}</strong>,
              },
              {
                header: t.rebalance.colPrice,
                align: "right",
                accessor: (o) => {
                  const price = positions.get(o.isin)?.price;
                  return price ? (
                    <span className="whitespace-nowrap">
                      {price.value} {price.currency}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t.rebalance.noPriceCell}</span>
                  );
                },
              },
              {
                header: t.rebalance.colCost,
                align: "right",
                accessor: (o) => formatPln(o.costPln, lang),
              },
              {
                header: t.rebalance.colFee,
                align: "right",
                accessor: (o) => formatPln(o.feePln, lang),
              },
              {
                header: t.rebalance.colAmountPlan,
                align: "right",
                accessor: (o) => formatPln(o.idealBuyPln, lang),
              },
              {
                header: t.rebalance.after,
                align: "right",
                accessor: (o) => formatPercent(o.afterWeight, lang),
              },
              {
                header: t.rebalance.driftAfter,
                align: "right",
                accessor: (o) => (
                  <span className="whitespace-nowrap">{formatPp(o.driftAfterPp, lang)}</span>
                ),
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="quiet" onClick={exportCsv}>
              {t.rebalance.exportUnitsCsv}
            </Button>
            <p className="text-sm text-muted-foreground">{t.rebalance.unitsNote}</p>
          </div>
        </>
      )}
    </section>
  );
}
