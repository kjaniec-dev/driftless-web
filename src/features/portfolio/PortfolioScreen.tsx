import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DonutChart,
  MetricCard,
} from "@kjaniec-dev/ui";
import { useMemo } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { type BuyOrder, computePlan } from "@/core";
import { demoPortfolio } from "@/features/demo";
import { useI18n } from "@/i18n";
import { formatPercent, formatPln, formatPp } from "@/lib/format";

export function PortfolioScreen() {
  const { t, lang } = useI18n();
  // Cash is excluded here: the dashboard shows the holdings as they are today.
  const plan = useMemo(() => computePlan({ ...demoPortfolio, cashPln: 0 }), []);
  const held = new Set(demoPortfolio.positions.map((p) => p.isin));
  const name = (o: BuyOrder) => o.label ?? o.isin;

  return (
    <>
      <ScreenHeader
        title={t.portfolio.title}
        description={`${t.portfolio.description} ${t.portfolio.asOf}: ${demoPortfolio.asOf ?? "-"}`}
      />
      <Alert variant="warning" className="mb-6">
        {t.app.demoBanner}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <MetricCard
          title={t.portfolio.total}
          value={formatPln(plan.positionsPln + demoPortfolio.cashPln, lang)}
        />
        <MetricCard title={t.portfolio.invested} value={formatPln(plan.positionsPln, lang)} />
        <MetricCard title={t.portfolio.cash} value={formatPln(demoPortfolio.cashPln, lang)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t.portfolio.allocation}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={plan.orders.map((o) => ({ name: name(o), value: o.currentPln }))}
              category="name"
              value="value"
              valueFormatter={(v) => formatPln(v, lang)}
              ariaLabel={t.portfolio.allocation}
              caption={t.portfolio.allocation}
              valueLabel={t.portfolio.value}
            />
          </CardContent>
        </Card>

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
                  <span className="font-mono text-xs text-muted-foreground">{o.isin}</span>
                  {!held.has(o.isin) && <Badge variant="warning">{t.portfolio.held}</Badge>}
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
