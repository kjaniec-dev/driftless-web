import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  useToast,
} from "@kjaniec-dev/ui";
import { useState } from "react";
import { useSession } from "@/app/session";
import { Button } from "@/components/Button";
import { NameDialog } from "@/components/NameDialog";
import { ScreenHeader } from "@/components/ScreenHeader";
import { pySum } from "@/core/float";
import { useI18n } from "@/i18n";
import { formatDate, formatPln } from "@/lib/format";
import { navigate } from "@/lib/router";
import { storage } from "@/lib/storage";
import type { StoredPortfolio } from "@/storage/model";
import { positionValue } from "@/storage/validate";

const DISMISSED_KEY = "driftless.firstUseDismissed";

type Dialog =
  | { kind: "new" }
  | { kind: "rename"; portfolio: StoredPortfolio }
  | { kind: "delete"; portfolio: StoredPortfolio }
  | null;

export function StartScreen() {
  const { t, lang, format } = useI18n();
  const session = useSession();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dismissed, setDismissed] = useState(() => storage.get(DISMISSED_KEY) === "1");
  const storageOk = session.storage === "ok";

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast({ message: done, tone: "success" });
      setDialog(null);
    } catch {
      toast({ message: t.start.actionFailed, tone: "danger" });
    }
  };

  return (
    <>
      <ScreenHeader
        eyebrow={t.app.tagline}
        title={t.start.title}
        description={t.start.description}
      />

      {session.storage === "unavailable" && (
        <Alert variant="danger" title={t.app.storageUnavailableTitle} className="mb-6">
          {t.app.storageUnavailableBody}
        </Alert>
      )}

      {!dismissed && (
        <Alert variant="info" title={t.start.firstUseTitle} className="mb-6">
          <span className="flex flex-wrap items-center gap-3">
            <span>{t.start.firstUseBody}</span>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                storage.set(DISMISSED_KEY, "1");
                setDismissed(true);
              }}
            >
              {t.start.firstUseDismiss}
            </Button>
          </span>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t.start.privacyTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.start.privacyBody}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!storageOk} onClick={() => setDialog({ kind: "new" })}>
              {t.start.newPortfolio}
            </Button>
            <Button variant="quiet" onClick={() => navigate("/data")}>
              {t.start.importJson}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                session.startDemo();
                navigate("/portfolio");
              }}
            >
              {t.start.demo}
            </Button>
          </div>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-bold">{t.start.yourPortfolios}</h2>
      {session.portfolios.length === 0 ? (
        <EmptyState title={t.start.noPortfolios} className="min-h-40" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {session.portfolios.map((p) => {
            const invested = pySum(p.positions.map(positionValue));
            const isActive = !session.isDemo && session.active?.id === p.id;
            return (
              <li key={p.id}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 pt-6">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 break-words text-base font-bold">{p.name}</h3>
                      {isActive && <Badge variant="primary">{t.nav.portfolio}</Badge>}
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <dt>{t.start.instruments}</dt>
                        <dd className="text-sm font-semibold text-foreground">
                          {p.positions.length}
                        </dd>
                      </div>
                      <div>
                        <dt>{t.start.total}</dt>
                        <dd className="text-sm font-semibold text-foreground">
                          {formatPln(invested, lang)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t.start.updated}</dt>
                        <dd className="text-sm font-semibold text-foreground">
                          {formatDate(p.updatedAt, lang)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          session.select(p.id);
                          navigate("/portfolio");
                        }}
                      >
                        {t.common.open}
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => setDialog({ kind: "rename", portfolio: p })}
                      >
                        {t.common.rename}
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() =>
                          run(
                            () => session.duplicate(p.id, t.common.copySuffix),
                            t.start.duplicated,
                          )
                        }
                      >
                        {t.common.duplicate}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDialog({ kind: "delete", portfolio: p })}
                      >
                        {t.common.delete}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <NameDialog
        open={dialog?.kind === "new"}
        title={t.start.newTitle}
        confirmLabel={t.start.create}
        hint={t.start.nameHint}
        onClose={() => setDialog(null)}
        onSubmit={(name) =>
          run(async () => {
            await session.create(name);
            navigate("/edit");
          }, t.start.created)
        }
      />
      <NameDialog
        open={dialog?.kind === "rename"}
        title={t.start.renameTitle}
        confirmLabel={t.common.rename}
        initial={dialog?.kind === "rename" ? dialog.portfolio.name : ""}
        onClose={() => setDialog(null)}
        onSubmit={(name) =>
          run(
            () =>
              dialog?.kind === "rename"
                ? session.rename(dialog.portfolio.id, name)
                : Promise.resolve(),
            t.start.renamed,
          )
        }
      />
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          title={t.start.deleteTitle}
          description={format(t.start.deleteBody, { name: dialog.portfolio.name })}
          confirmLabel={t.common.delete}
          cancelLabel={t.common.cancel}
          tone="danger"
          onConfirm={() => run(() => session.remove(dialog.portfolio.id), t.start.deleted)}
        />
      )}
    </>
  );
}
