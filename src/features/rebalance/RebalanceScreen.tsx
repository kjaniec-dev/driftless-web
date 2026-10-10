import { Alert, Card, CardContent, DataTable, FormField, Input, MetricCard } from "@kjaniec-dev/ui";
import { useMemo, useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  computePlan,
  PortfolioValidationError,
  parseDecimal,
  type RebalancePlan,
  type ValidationIssue,
} from "@/core";
import { demoPortfolio } from "@/features/demo";
import { useI18n } from "@/i18n";
import { formatPercent, formatPln, formatPp } from "@/lib/format";
import { describeIssue, describeWarning } from "./issues";

type Result =
  | { kind: "plan"; plan: RebalancePlan }
  | { kind: "invalid"; issues: readonly ValidationIssue[] };

function calculate(cashInput: string): Result | null {
  const cash = parseDecimal(cashInput);
  if (cash === null) return null;
  try {
    return { kind: "plan", plan: computePlan({ ...demoPortfolio, cashPln: cash }) };
  } catch (error) {
    if (error instanceof PortfolioValidationError) return { kind: "invalid", issues: error.issues };
    throw error;
  }
}

export function RebalanceScreen() {
  const { t, lang, format } = useI18n();
  const [cashInput, setCashInput] = useState(String(demoPortfolio.cashPln));
  const result = useMemo(() => calculate(cashInput), [cashInput]);
  const cashInvalid = result === null;

  return (
    <>
      <ScreenHeader title={t.rebalance.title} description={t.rebalance.description} />
      <Alert variant="warning" className="mb-6">
        {t.app.demoBanner}
      </Alert>

      <Card className="mb-6">
        <CardContent className="max-w-sm pt-6">
          <FormField
            label={t.rebalance.cash}
            hint={t.rebalance.cashHint}
            {...(cashInvalid ? { error: t.rebalance.cashInvalid } : {})}
          >
            <Input
              inputMode="decimal"
              autoComplete="off"
              value={cashInput}
              error={cashInvalid}
              onChange={(e) => setCashInput(e.target.value)}
            />
          </FormField>
        </CardContent>
      </Card>

      {result?.kind === "invalid" && (
        <Alert variant="danger" title={t.rebalance.invalidPortfolio} className="mb-6">
          {result.issues.map((i) => describeIssue(i, t, format, lang)).join(" ")}
        </Alert>
      )}

      {result?.kind === "plan" && <PlanView plan={result.plan} />}

      <p className="mt-8 text-xs text-muted-foreground">{t.app.disclaimer}</p>
    </>
  );
}

function PlanView({ plan }: { plan: RebalancePlan }) {
  const { t, lang, format } = useI18n();
  const noPurchases = plan.cashDeployed === 0;

  return (
    <div className="space-y-6">
      {plan.warnings.map((w) => (
        <Alert key={w.code === "not_in_target" ? `${w.code}-${w.isin}` : w.code} variant="warning">
          {describeWarning(w, t, format, lang)}
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title={t.rebalance.deployed} value={formatPln(plan.cashDeployed, lang)} />
        <MetricCard title={t.rebalance.leftover} value={formatPln(plan.leftoverCash, lang)} />
        <MetricCard
          title={t.rebalance.totalAfter}
          value={formatPln(plan.positionsPln + plan.cashDeployed, lang)}
        />
      </div>

      {noPurchases && <Alert variant="info">{t.rebalance.noPurchases}</Alert>}

      <DataTable
        data={[...plan.orders]}
        getRowKey={(o) => o.isin}
        columns={[
          {
            header: t.portfolio.instrument,
            accessor: (o) => (
              <span className="flex flex-col">
                <span className="font-semibold">{o.label ?? o.isin}</span>
                <span className="font-mono text-xs text-muted-foreground">{o.isin}</span>
              </span>
            ),
          },
          {
            header: t.rebalance.buy,
            align: "right",
            accessor: (o) => <strong>{formatPln(o.buyPln, lang)}</strong>,
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
      <p className="text-sm text-muted-foreground">{t.rebalance.planNote}</p>
    </div>
  );
}
