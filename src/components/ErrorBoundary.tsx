import { Alert } from "@kjaniec-dev/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { downloadBackup } from "@/backup/actions";
import { Button } from "@/components/Button";
import { useI18n } from "@/i18n";
import { listPortfolios } from "@/storage/repository";

function Fallback() {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">{t.crash.title}</h1>
      <Alert variant="info">{t.crash.body}</Alert>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => window.location.reload()}>{t.crash.reload}</Button>
        <Button
          variant="quiet"
          onClick={async () => {
            // Straight from IndexedDB, so it works even if the failed screen is what broke.
            try {
              downloadBackup(await listPortfolios());
            } catch {
              // Storage unavailable: nothing to export.
            }
          }}
        >
          {t.crash.backup}
        </Button>
      </div>
    </main>
  );
}

/**
 * Last line of defence against a blank page. Deliberately local: the error goes to the browser
 * console only, never to a reporting service, because a stack trace or message could contain
 * financial data and the app promises that nothing leaves the device.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Driftless crashed (kept local, not reported):", error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
