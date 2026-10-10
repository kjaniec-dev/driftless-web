import { Alert, useToast } from "@kjaniec-dev/ui";
import { useSession } from "@/app/session";
import { Button } from "@/components/Button";
import { useI18n } from "@/i18n";
import { navigate } from "@/lib/router";

/** Shown on every screen while the in-memory demo is active; saving needs explicit consent. */
export function DemoBanner() {
  const { t } = useI18n();
  const session = useSession();
  const { toast } = useToast();
  if (!session.isDemo) return null;
  const canSave = session.storage === "ok";
  return (
    <Alert variant="warning" className="mb-6">
      <span className="flex flex-wrap items-center gap-3">
        <span>{t.app.demoBanner}</span>
        {canSave && (
          <Button
            size="sm"
            onClick={async () => {
              try {
                await session.saveDemoAsPortfolio();
                // Saving is asynchronous; say when it is done, so nothing (a person closing the tab,
                // a test reloading the page) acts on a half-finished write.
                toast({ message: t.edit.saved, tone: "success" });
                navigate("/portfolio");
              } catch {
                toast({ message: t.edit.saveFailed, tone: "danger" });
              }
            }}
          >
            {t.app.demoSave}
          </Button>
        )}
        <Button size="sm" variant="quiet" onClick={session.leaveDemo}>
          {t.app.demoLeave}
        </Button>
      </span>
    </Alert>
  );
}
