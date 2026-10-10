import { Alert, Card, CardContent, CardHeader, ConfirmDialog, useToast } from "@kjaniec-dev/ui";
import { useEffect, useState } from "react";
import { useSession } from "@/app/session";
import { downloadBackup } from "@/backup/actions";
import { CliExportError, storedToCliJson } from "@/backup/cli";
import { downloadText } from "@/backup/files";
import { Button } from "@/components/Button";
import { CardHeading } from "@/components/CardHeading";
import { FocusReturn } from "@/components/FocusReturn";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/i18n";
import { formatBytes } from "@/lib/format";
import { deleteAllData, requestPersistence, storageStatus } from "@/storage/repository";
import { ImportSection } from "./ImportSection";

export function DataScreen() {
  const { t, lang, format } = useI18n();
  const session = useSession();
  const { toast } = useToast();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof storageStatus>> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const storageOk = session.storage === "ok";
  const hasData = session.portfolios.length > 0;
  const active = session.active;
  const canExportCli = !!active && active.positions.some((p) => Number(p.targetWeight) > 0);

  useEffect(() => {
    void storageStatus().then(setStatus);
  }, []);

  const exportCli = () => {
    if (!active) return;
    try {
      downloadText(
        "portfolio.json",
        "application/json",
        `${JSON.stringify(storedToCliJson(active), null, 2)}\n`,
      );
    } catch (e) {
      if (!(e instanceof CliExportError)) throw e;
    }
  };

  const persist = async () => {
    const granted = await requestPersistence();
    toast({
      message: granted ? t.data.persistGranted : t.data.persistDenied,
      tone: granted ? "success" : "danger",
    });
    setStatus(await storageStatus());
  };

  return (
    <>
      <ScreenHeader title={t.data.title} description={t.data.description} />

      {session.storage === "unavailable" && (
        <Alert variant="danger" title={t.app.storageUnavailableTitle} className="mb-6">
          {t.app.storageUnavailableBody}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardHeading>{t.data.principlesTitle}</CardHeading>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {t.data.principles.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardHeading>{t.data.storageTitle}</CardHeading>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="warning">{t.data.storageBody}</Alert>
            {storageOk && status && (
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{t.data.statusTitle}</p>
                <p>
                  {status.persisted === null
                    ? t.data.persistedUnknown
                    : status.persisted
                      ? t.data.persistedYes
                      : t.data.persistedNo}
                </p>
                {status.usageBytes !== null && (
                  <p className="text-muted-foreground">
                    {format(t.data.usage, { size: formatBytes(status.usageBytes, lang) })}
                  </p>
                )}
                {status.persisted === false && (
                  <Button size="sm" variant="quiet" onClick={persist}>
                    {t.data.requestPersist}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardHeading>{t.data.backupTitle}</CardHeading>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.data.backupBody}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!hasData}
                onClick={() => {
                  downloadBackup(session.portfolios);
                  toast({ message: t.data.exportedBackup, tone: "success" });
                }}
              >
                {t.data.exportBackup}
              </Button>
              {active && (
                <Button variant="quiet" disabled={!canExportCli} onClick={exportCli}>
                  {format(t.data.exportCli, { name: active.name })}
                </Button>
              )}
            </div>
            {!hasData && <p className="text-sm text-muted-foreground">{t.data.noPortfolios}</p>}
            <p className="text-xs text-muted-foreground">
              {active && !canExportCli ? t.data.exportCliNoTargets : t.data.exportCliHint}
            </p>
          </CardContent>
        </Card>

        <ImportSection />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardHeading>{t.data.dangerTitle}</CardHeading>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.data.dangerBody}</p>
            <Button
              variant="danger"
              disabled={!storageOk || !hasData}
              onClick={() => setConfirmDelete(true)}
            >
              {t.data.deleteAll}
            </Button>
          </CardContent>
        </Card>
      </div>

      {confirmDelete && (
        <>
          <FocusReturn />
          <ConfirmDialog
            open
            onClose={() => setConfirmDelete(false)}
            title={t.data.deleteAllTitle}
            description={t.data.deleteAllBody}
            confirmLabel={t.data.deleteAll}
            cancelLabel={t.common.cancel}
            tone="danger"
            onConfirm={async () => {
              await deleteAllData();
              setConfirmDelete(false);
              toast({ message: t.data.deletedAll, tone: "success" });
            }}
          />
        </>
      )}
    </>
  );
}
