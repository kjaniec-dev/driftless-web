import { Alert } from "@kjaniec-dev/ui";
import { useSession } from "@/app/session";
import { Button } from "@/components/Button";
import { useI18n } from "@/i18n";
import { navigate } from "@/lib/router";

/** Shown on every screen while the in-memory demo is active; saving needs explicit consent. */
export function DemoBanner() {
  const { t } = useI18n();
  const session = useSession();
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
              await session.saveDemoAsPortfolio();
              navigate("/portfolio");
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
