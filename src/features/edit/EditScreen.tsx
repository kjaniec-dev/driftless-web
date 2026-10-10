import { Alert, Badge, Card, CardContent, EmptyState, useToast } from "@kjaniec-dev/ui";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/app/session";
import { Button } from "@/components/Button";
import { DemoBanner } from "@/components/DemoBanner";
import { Field } from "@/components/Field";
import { NoPortfolio } from "@/components/NoPortfolio";
import { ScreenHeader } from "@/components/ScreenHeader";
import { describeStoredIssue } from "@/features/issues";
import { useI18n } from "@/i18n";
import { formatPercent } from "@/lib/format";
import { applyNbpRates, draftCurrencies } from "@/market/apply";
import { fetchNbpRates } from "@/market/nbp";
import {
  type Draft,
  draftFromStored,
  draftToStored,
  draftWeightSumPercent,
  emptyRow,
} from "@/storage/draft";
import type { StoredPortfolio } from "@/storage/model";
import type { StoredIssue } from "@/storage/validate";
import { InstrumentRow } from "./InstrumentRow";

export function EditScreen() {
  const { active } = useSession();
  if (!active) return <NoPortfolio />;
  // Keyed by id: switching portfolios starts a fresh draft; saving keeps the draft in place.
  return <Editor key={active.id} portfolio={active} />;
}

/** Everything except the React keys, so "dirty" ignores row identity. */
const signature = (d: Draft) =>
  JSON.stringify([
    d.name,
    d.asOf,
    d.cash,
    d.commissionPct,
    d.commissionMin,
    d.rows.map(({ key: _key, ...rest }) => rest),
  ]);

function Editor({ portfolio }: { portfolio: StoredPortfolio }) {
  const { t, lang, format } = useI18n();
  const session = useSession();
  const { toast } = useToast();

  const [baseline, setBaseline] = useState(portfolio);
  const [draft, setDraft] = useState(() => draftFromStored(portfolio));
  const [baselineSignature, setBaselineSignature] = useState(() => signature(draft));
  const [submitted, setSubmitted] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = signature(draft) !== baselineSignature;
  const changedElsewhere = session.active?.updatedAt !== baseline.updatedAt;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const result = useMemo(
    () => draftToStored(draft, baseline, new Date().toISOString()),
    [draft, baseline],
  );
  const issues = result.issues;
  const rowIssues = (index: number) =>
    issues.filter(
      (i): i is Extract<StoredIssue, { index: number }> => "index" in i && i.index === index,
    );
  const globalIssues = issues.filter((i) => !("index" in i));

  const reset = (p: StoredPortfolio) => {
    const next = draftFromStored(p);
    setBaseline(p);
    setDraft(next);
    setBaselineSignature(signature(next));
    setSubmitted(false);
  };

  const patch = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const patchRow = (key: string, changes: Partial<Draft["rows"][number]>) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.key === key ? { ...r, ...changes } : r)),
    }));

  const save = async () => {
    setSubmitted(true);
    if (!result.portfolio) return;
    setSaving(true);
    try {
      reset(await session.save(result.portfolio));
      toast({ message: t.edit.saved, tone: "success" });
    } catch {
      toast({ message: t.edit.saveFailed, tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const fetchRates = async () => {
    setFetching(true);
    try {
      const wanted = draftCurrencies(draft);
      const { rates, errors } = await fetchNbpRates(wanted);
      const got = Object.keys(rates);
      const failed = Object.keys(errors);
      if (got.length > 0) setDraft((d) => applyNbpRates(d, rates));
      if (failed.length === 0) {
        toast({ message: format(t.edit.ratesOk, { currencies: got.join(", ") }), tone: "success" });
      } else if (got.length === 0) {
        toast({ message: t.edit.ratesFailed, tone: "danger" });
      } else {
        toast({
          message: format(t.edit.ratesPartial, { currencies: failed.join(", ") }),
          tone: "danger",
        });
      }
    } finally {
      setFetching(false);
    }
  };

  const weightSum = draftWeightSumPercent(draft);
  const remaining = 100 - weightSum;
  const balanced = Math.abs(remaining) <= 0.01;
  const hasForeign = draftCurrencies(draft).length > 0;
  const duplicateOf = (index: number) => rowIssues(index).some((i) => i.code === "duplicate_isin");

  return (
    <>
      <ScreenHeader title={t.edit.title} description={t.edit.description} />
      <DemoBanner />

      {changedElsewhere && (
        <Alert variant="warning" className="mb-6">
          <span className="flex flex-wrap items-center gap-3">
            <span>{t.edit.changedElsewhere}</span>
            {session.active && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => session.active && reset(session.active)}
              >
                {t.edit.reload}
              </Button>
            )}
          </span>
        </Alert>
      )}

      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <Field
            label={t.edit.name}
            value={draft.name}
            maxLength={100}
            error={
              submitted &&
              globalIssues.some((i) => i.code === "name_required" || i.code === "name_too_long")
                ? t.issues.name_required
                : undefined
            }
            onChange={(e) => patch({ name: e.target.value })}
          />
          <Field
            label={t.edit.asOf}
            type="date"
            value={draft.asOf}
            error={
              globalIssues.some((i) => i.code === "invalid_as_of")
                ? t.issues.invalid_as_of
                : undefined
            }
            onChange={(e) => patch({ asOf: e.target.value })}
          />
          <Field
            label={t.edit.cash}
            hint={t.edit.cashHint}
            inputMode="decimal"
            autoComplete="off"
            value={draft.cash}
            error={
              globalIssues.some((i) => i.code === "invalid_cash")
                ? t.issues.invalid_cash
                : undefined
            }
            onChange={(e) => patch({ cash: e.target.value })}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-lg font-bold">{t.edit.costsTitle}</h2>
          <p className="text-xs text-muted-foreground">{t.edit.costsHint}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={t.edit.commissionPct}
              inputMode="decimal"
              autoComplete="off"
              value={draft.commissionPct}
              error={
                globalIssues.some((i) => i.code === "invalid_commission")
                  ? t.issues.invalid_commission
                  : undefined
              }
              onChange={(e) => patch({ commissionPct: e.target.value })}
            />
            <Field
              label={t.edit.commissionMin}
              inputMode="decimal"
              autoComplete="off"
              value={draft.commissionMin}
              onChange={(e) => patch({ commissionMin: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t.edit.instruments}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {draft.rows.length > 0 && (
            <Badge variant={balanced ? "success" : "warning"}>
              {t.edit.targetTotal}: {formatPercent(weightSum / 100, lang, 2)} ·{" "}
              {balanced
                ? t.edit.totalOk
                : format(remaining > 0 ? t.edit.totalRemaining : t.edit.totalOver, {
                    amount: formatPercent(Math.abs(remaining) / 100, lang, 2),
                  })}
            </Badge>
          )}
          {hasForeign && (
            <Button size="sm" variant="quiet" loading={fetching} onClick={fetchRates}>
              {fetching ? t.edit.fetching : t.edit.fetchRates}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, emptyRow()] }))}
          >
            {t.edit.add}
          </Button>
        </div>
      </div>

      {hasForeign && <p className="mb-3 text-xs text-muted-foreground">{t.edit.nbpNote}</p>}

      {draft.rows.length === 0 ? (
        <EmptyState title={t.edit.noInstruments} className="min-h-40" />
      ) : (
        <ul className="space-y-4">
          {draft.rows.map((row, index) => (
            <li key={row.key}>
              <InstrumentRow
                row={row}
                index={index}
                showAllErrors={submitted}
                issues={rowIssues(index)}
                duplicate={duplicateOf(index)}
                onChange={(changes) => patchRow(row.key, changes)}
                onRemove={() =>
                  setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.key !== row.key) }))
                }
              />
            </li>
          ))}
        </ul>
      )}

      {submitted && issues.length > 0 && (
        <Alert variant="danger" title={t.edit.fixIssues} className="mt-6">
          <span className="block">
            {issues.map((i) => describeStoredIssue(i, t, format, lang)).join(" ")}
          </span>
        </Alert>
      )}

      <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-kj-lg border border-border bg-surface px-4 py-3 shadow-kj-lg">
        <Button onClick={save} disabled={!dirty} loading={saving}>
          {t.edit.save}
        </Button>
        <Button variant="quiet" disabled={!dirty} onClick={() => reset(baseline)}>
          {t.edit.discard}
        </Button>
        {dirty && <span className="text-sm text-muted-foreground">{t.edit.unsaved}</span>}
      </div>
    </>
  );
}
