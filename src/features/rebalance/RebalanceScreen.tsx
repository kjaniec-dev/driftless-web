import { Alert, Card, CardContent, DataTable, EmptyState, MetricCard } from "@kjaniec-dev/ui";
import { useMemo, useState } from "react";
import { useSession } from "@/app/session";
import { planToCsv } from "@/backup/csv";
import { dateStamp, downloadText } from "@/backup/files";
import { Button } from "@/components/Button";
import { DemoBanner } from "@/components/DemoBanner";
import { Field } from "@/components/Field";
import { NoPortfolio } from "@/components/NoPortfolio";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  computePlan,
  PortfolioValidationError,
  parseDecimal,
  type RebalancePlan,
  type ValidationIssue,
} from "@/core";
import { describeIssue, describeWarning } from "@/features/issues";
import { useI18n } from "@/i18n";
import { formatDate, formatPercent, formatPln, formatPp } from "@/lib/format";
import { navigate } from "@/lib/router";
import { toEnginePortfolio } from "@/storage/convert";
import type { StoredPortfolio } from "@/storage/model";
import { UnitPlanView } from "./UnitPlanView";

type Result =
  | { kind: "plan"; plan: RebalancePlan }
  | { kind: "invalid"; issues: readonly ValidationIssue[] };

function calculate(portfolio: StoredPortfolio, cashInput: string): Result | null {
  const cash = parseDecimal(cashInput.trim() === "" ? "0" : cashInput);
  if (cash === null) return null;
  try {
    return { kind: "plan", plan: computePlan(toEnginePortfolio(portfolio, cash)) };
  } catch (error) {
    if (error instanceof PortfolioValidationError) return { kind: "invalid", issues: error.issues };
    throw error;
  }
}

export function RebalanceScreen() {
  const { active } = useSession();
  if (!active) return <NoPortfolio />;
  // Keyed so switching portfolios resets the cash amount to that portfolio's saved one.
  return <Rebalance key={active.id} portfolio={active} />;
}

function Rebalance({ portfolio }: { portfolio: StoredPortfolio }) {
  const { t, lang, format } = useI18n();
  const [cashInput, setCashInput] = useState(portfolio.cashPln);
  const result = useMemo(() => calculate(portfolio, cashInput), [portfolio, cashInput]);
  const cashInvalid = result === null;
  const savedCash = formatPln(Number(portfolio.cashPln), lang);
  const differsFromSaved = parseDecimal(cashInput) !== Number(portfolio.cashPln);

  if (portfolio.positions.length === 0) {
    return (
      <>
        <ScreenHeader title={t.rebalance.title} description={t.rebalance.description} />
        <DemoBanner />
        <EmptyState
          title={t.rebalance.emptyTitle}
          description={t.rebalance.emptyBody}
          action={<Button onClick={() => navigate("/edit")}>{t.portfolio.goEdit}</Button>}
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader title={t.rebalance.title} description={t.rebalance.description} />
      <DemoBanner />

      <Card className="mb-6">
        <CardContent className="max-w-sm space-y-2 pt-6">
          <Field
            label={t.rebalance.cash}
            hint={t.rebalance.cashHint}
            error={cashInvalid ? t.rebalance.cashInvalid : undefined}
            inputMode="decimal"
            autoComplete="off"
            value={cashInput}
            onChange={(e) => setCashInput(e.target.value)}
          />
          {differsFromSaved && (
            <Button size="sm" variant="quiet" onClick={() => setCashInput(portfolio.cashPln)}>
              {format(t.rebalance.resetCash, { amount: savedCash })}
            </Button>
          )}
        </CardContent>
      </Card>

      {result?.kind === "invalid" && (
        <Alert variant="danger" title={t.rebalance.invalidPortfolio} className="mb-6">
          {result.issues.map((i) => describeIssue(i, t, format, lang)).join(" ")}
        </Alert>
      )}

      {result?.kind === "plan" && <PlanView plan={result.plan} portfolio={portfolio} />}

      <p className="mt-8 text-xs text-muted-foreground">{t.app.disclaimer}</p>
    </>
  );
}

function PlanView({ plan, portfolio }: { plan: RebalancePlan; portfolio: StoredPortfolio }) {
  const { t, lang, format } = useI18n();
  const noPurchases = plan.cashDeployed === 0;

  const rates = portfolio.positions.flatMap((p) =>
    p.valuation.mode === "fx" ? [p.valuation] : [],
  );
  const distinctRates = [
    ...new Map(rates.map((v) => [`${v.currency}|${v.rate.mid}|${v.rate.source}`, v])).values(),
  ];

  const exportCsv = () =>
    downloadText(`driftless-plan-${dateStamp(new Date())}.csv`, "text/csv", planToCsv(plan));

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
        // Horizontally scrollable on phones: must be reachable and named for keyboard users.
        tabIndex={0}
        role="region"
        aria-label={t.rebalance.tableLabel}
        data={[...plan.orders]}
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

      {distinctRates.length > 0 && (
        <Alert variant="info" title={t.rebalance.fxTitle}>
          <span className="block">
            {distinctRates
              .map((v) =>
                format(t.rebalance.fxLine, {
                  currency: v.currency,
                  rate: v.rate.mid,
                  source:
                    v.rate.source === "nbp" && v.rate.effectiveDate
                      ? format(t.rebalance.sourceNbp, {
                          date: formatDate(v.rate.effectiveDate, lang),
                        })
                      : t.rebalance.sourceManual,
                }),
              )
              .join("; ")}
            {". "}
            {t.edit.nbpNote}
          </span>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="quiet" onClick={exportCsv}>
          {t.rebalance.exportCsv}
        </Button>
        <p className="text-sm text-muted-foreground">{t.rebalance.planNote}</p>
      </div>

      <UnitPlanView plan={plan} portfolio={portfolio} />
    </div>
  );
}
