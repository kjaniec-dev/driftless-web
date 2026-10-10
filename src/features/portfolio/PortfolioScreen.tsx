import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DonutChart,
  EmptyState,
  MetricCard,
} from "@kjaniec-dev/ui";
import { useMemo } from "react";
import { useSession } from "@/app/session";
import { DemoBanner } from "@/components/DemoBanner";
import { NoPortfolio } from "@/components/NoPortfolio";
import { ScreenHeader } from "@/components/ScreenHeader";
import { type BuyOrder, computePlan, type RebalancePlan } from "@/core";
import { useI18n } from "@/i18n";
import { formatDate, formatPercent, formatPln, formatPp } from "@/lib/format";
import { navigate } from "@/lib/router";
import { toEnginePortfolio } from "@/storage/convert";

export function PortfolioScreen() {
  const { t, lang } = useI18n();
  const { active: p } = useSession();

  // The dashboard only reads weights and drift, which depend on the holdings, not the cash.
  const plan = useMemo<RebalancePlan | null>(() => {
    if (!p) return null;
    try {
      return computePlan(toEnginePortfolio(p));
    } catch {
      return null; // nothing valued yet (all values and cash are zero)
    }
  }, [p]);

  if (!p) return <NoPortfolio />;

  const header = (
    <ScreenHeader
      title={p.name}
      description={`${t.portfolio.description}${p.asOf ? ` ${t.portfolio.asOf}: ${formatDate(p.asOf, lang)}` : ""}`}
    />
  );

  if (p.positions.length === 0 || plan === null) {
    return (
      <>
        {header}
        <DemoBanner />
        <EmptyState
          title={t.portfolio.noInstrumentsTitle}
          description={t.portfolio.noInstrumentsBody}
          action={<Button onClick={() => navigate("/edit")}>{t.portfolio.goEdit}</Button>}
        />
      </>
    );
  }

  const name = (o: BuyOrder) => o.label ?? o.isin;
  const total = plan.positionsPln + plan.cashPln;

  return (
    <>
      {header}
      <DemoBanner />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <MetricCard title={t.portfolio.total} value={formatPln(total, lang)} />
        <MetricCard title={t.portfolio.invested} value={formatPln(plan.positionsPln, lang)} />
        <MetricCard title={t.portfolio.cash} value={formatPln(plan.cashPln, lang)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {plan.positionsPln > 0 && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t.portfolio.allocation}</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={plan.orders
                  .filter((o) => o.currentPln > 0)
                  .map((o) => ({ name: name(o), value: o.currentPln }))}
                category="name"
                value="value"
                valueFormatter={(v) => formatPln(v, lang)}
                ariaLabel={t.portfolio.allocation}
                caption={t.portfolio.allocation}
                valueLabel={t.portfolio.value}
              />
            </CardContent>
          </Card>
        )}

        <DataTable
          className="min-w-0"
          data={[...plan.orders]}
          getRowKey={(o) => o.isin}
          columns={[
            {
              header: t.portfolio.instrument,
              accessor: (o) => (
                <span className="flex flex-col">
                  <span className="font-semibold">{name(o)}</span>
                  {o.label && (
                    <span className="font-mono text-xs text-muted-foreground">{o.isin}</span>
                  )}
                  {o.targetWeight === 0 && <Badge variant="warning">{t.portfolio.held}</Badge>}
                </span>
              ),
            },
            {
              header: t.portfolio.value,
              align: "right",
              accessor: (o) => formatPln(o.currentPln, lang),
            },
            {
              header: t.portfolio.current,
              align: "right",
              accessor: (o) => formatPercent(o.currentWeight, lang),
            },
            {
              header: t.portfolio.target,
              align: "right",
              accessor: (o) => formatPercent(o.targetWeight, lang),
            },
            {
              header: t.portfolio.drift,
              align: "right",
              accessor: (o) => (
                <span className="whitespace-nowrap">{formatPp(o.driftPp, lang)}</span>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
