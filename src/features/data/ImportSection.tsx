import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dropzone,
  SelectField,
  useToast,
} from "@kjaniec-dev/ui";
import { useMemo, useState } from "react";
import { useSession } from "@/app/session";
import { cliCurrenciesNeeded, cliToStored } from "@/backup/cli";
import { FileTooLargeError, readFileText } from "@/backup/files";
import { BackupError, type BackupFile, parseBackupData } from "@/backup/format";
import { type ImportStrategy, planImport, planToChanges } from "@/backup/import-plan";
import { Button } from "@/components/Button";
import { CardHeading } from "@/components/CardHeading";
import { Field } from "@/components/Field";
import { FocusReturn } from "@/components/FocusReturn";
import { CliFormatError, type FxRates, PortfolioValidationError, parseCliPortfolio } from "@/core";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { fetchNbpRates } from "@/market/nbp";
import { type FxCurrency, isFxCurrency } from "@/storage/model";
import { applyChanges } from "@/storage/repository";

type Loaded =
  | { kind: "backup"; fileName: string; backup: BackupFile }
  | { kind: "cli"; fileName: string; data: unknown; currencies: FxCurrency[] };

type Problem = { code: keyof ReturnType<typeof useI18n>["t"]["fileErrors"]; path: string };

const STRATEGIES: ImportStrategy[] = ["merge", "copy", "replace"];

/** Reads and classifies a file. Throws a `Problem`-shaped error for anything we refuse. */
async function loadFile(file: File): Promise<Loaded> {
  let text: string;
  try {
    text = await readFileText(file);
  } catch (e) {
    throw {
      code: e instanceof FileTooLargeError ? "too_large" : "unreadable",
      path: "",
    } satisfies Problem;
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw { code: "invalid_json", path: "" } satisfies Problem;
  }

  const isObject = typeof data === "object" && data !== null && !Array.isArray(data);
  if (isObject && (data as { format?: unknown }).format === "driftless-web") {
    try {
      return { kind: "backup", fileName: file.name, backup: parseBackupData(data) };
    } catch (e) {
      if (e instanceof BackupError) throw { code: e.code, path: e.path } satisfies Problem;
      throw e;
    }
  }
  if (isObject && "base_currency" in (data as object)) {
    const currencies = cliCurrenciesNeeded(data).filter(isFxCurrency);
    // Validate the structure now (with placeholder rates) so errors show before confirming.
    const placeholder: FxRates = Object.fromEntries(currencies.map((c) => [c, 1]));
    try {
      parseCliPortfolio(data, placeholder);
    } catch (e) {
      if (e instanceof CliFormatError)
        throw { code: "cli_invalid", path: e.path } satisfies Problem;
      if (e instanceof PortfolioValidationError) {
        throw {
          code: "cli_invalid",
          path: e.issues.map((i) => i.code).join(", "),
        } satisfies Problem;
      }
      throw e;
    }
    return { kind: "cli", fileName: file.name, data, currencies };
  }
  throw { code: "not_driftless", path: "" } satisfies Problem;
}

export function ImportSection() {
  const { t, lang, format } = useI18n();
  const session = useSession();
  const { toast } = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy>("merge");
  const [cliName, setCliName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const disabled = session.storage !== "ok";

  const plan = useMemo(
    () =>
      loaded?.kind === "backup"
        ? planImport(session.portfolios, loaded.backup.portfolios, strategy, {
            copySuffix: t.common.importSuffix,
          })
        : null,
    [loaded, strategy, session.portfolios, t.common.importSuffix],
  );
  const writes = plan ? planToChanges(plan).put.length : 0;

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setProblem(null);
    setLoaded(null);
    try {
      const next = await loadFile(file);
      setLoaded(next);
      setCliName(file.name.replace(/\.json$/i, ""));
    } catch (e) {
      const known = e as Partial<Problem>;
      setProblem(
        known.code
          ? { code: known.code, path: known.path ?? "" }
          : { code: "unreadable", path: "" },
      );
    }
  };

  const finish = (message: string) => {
    toast({ message, tone: "success" });
    setLoaded(null);
    setConfirming(false);
  };

  const failStorage = () => setProblem({ code: "storage", path: "" });

  const applyBackup = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await applyChanges(planToChanges(plan));
      finish(format(t.data.importedCount, { count: writes }));
    } catch {
      failStorage();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const applyCli = async () => {
    if (loaded?.kind !== "cli") return;
    setBusy(true);
    try {
      const rates: FxRates = {};
      if (loaded.currencies.length > 0) {
        const { rates: got } = await fetchNbpRates(loaded.currencies);
        for (const c of loaded.currencies) {
          const rate = got[c];
          if (!rate) {
            setProblem({ code: "rates_unavailable", path: loaded.currencies.join(", ") });
            return;
          }
          (rates as Record<string, number>)[c] = Number(rate.mid);
        }
      }
      const names = new Set(session.portfolios.map((p) => p.name));
      const base = cliName.trim() || "Portfolio";
      const now = new Date().toISOString();
      const name = names.has(base) ? `${base} (${t.common.importSuffix})` : base;
      const stored = cliToStored(loaded.data, rates, { id: crypto.randomUUID(), name, now });
      await applyChanges({ put: [stored] });
      session.select(stored.id);
      finish(format(t.data.importedCount, { count: 1 }));
    } catch {
      failStorage();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="import">
      <CardHeader>
        <CardHeading>{t.data.importTitle}</CardHeading>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t.data.importBody}</p>

        <Dropzone
          accept=".json,application/json"
          multiple={false}
          disabled={disabled}
          onFiles={onFiles}
        >
          <span className="block py-4 text-center text-sm">
            <strong className="block">{t.data.drop}</strong>
            <span className="text-muted-foreground">{t.data.dropHint}</span>
          </span>
        </Dropzone>

        {problem && (
          <Alert variant="danger">
            {format(t.fileErrors[problem.code], { path: problem.path || "-" })}
          </Alert>
        )}

        {loaded?.kind === "backup" && plan && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold">
              {t.data.previewTitle}: {loaded.fileName}
            </h3>
            <SelectField
              label={t.data.strategyLabel}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as ImportStrategy)}
            >
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {t.data.strategies[s]}
                </option>
              ))}
            </SelectField>

            <DataTable
              tabIndex={0}
              role="region"
              aria-label={t.data.previewTitle}
              data={[...plan.items]}
              getRowKey={(i) => i.incoming.id}
              columns={[
                {
                  header: t.data.colPortfolio,
                  accessor: (i) => <strong>{i.incoming.name}</strong>,
                },
                {
                  header: t.data.colInstruments,
                  align: "right",
                  accessor: (i) => i.incoming.positions.length,
                },
                {
                  header: t.data.colUpdated,
                  accessor: (i) => formatDate(i.incoming.updatedAt, lang),
                },
                { header: t.data.colOutcome, accessor: (i) => t.data.outcomes[i.outcome] },
              ]}
            />

            <Button
              disabled={writes === 0}
              loading={busy}
              onClick={() => (plan.overwrites ? setConfirming(true) : void applyBackup())}
            >
              {writes === 0 ? t.data.nothingToImport : t.data.importButton}
            </Button>
          </div>
        )}

        {loaded?.kind === "cli" && (
          <div className="space-y-4">
            <Alert variant="info">
              {t.data.cliDetected}
              {loaded.currencies.length > 0 &&
                ` ${format(t.data.cliNeedRates, { currencies: loaded.currencies.join(", ") })}`}
            </Alert>
            <Field
              label={t.data.cliName}
              value={cliName}
              maxLength={100}
              onChange={(e) => setCliName(e.target.value)}
            />
            <Button loading={busy} onClick={applyCli}>
              {t.data.cliImportButton}
            </Button>
          </div>
        )}
      </CardContent>

      {confirming && (
        <>
          <FocusReturn />
          <ConfirmDialog
            open
            onClose={() => setConfirming(false)}
            title={t.data.confirmReplaceTitle}
            description={format(t.data.confirmReplaceBody, {
              count: plan?.items.filter((i) => i.outcome === "replace").length ?? 0,
            })}
            confirmLabel={t.data.confirmReplace}
            cancelLabel={t.common.cancel}
            tone="danger"
            loading={busy}
            onConfirm={() => void applyBackup()}
          />
        </>
      )}
    </Card>
  );
}
