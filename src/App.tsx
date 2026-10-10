import { DashboardShell, Segmented, SidebarNav, ToastProvider } from "@kjaniec-dev/ui";
import type { ReactNode } from "react";
import { useSession } from "@/app/session";
import { downloadBackup } from "@/backup/actions";
import { Button } from "@/components/Button";
import { PortfolioSwitcher } from "@/components/PortfolioSwitcher";
import { DataScreen } from "@/features/data/DataScreen";
import { EditScreen } from "@/features/edit/EditScreen";
import { PortfolioScreen } from "@/features/portfolio/PortfolioScreen";
import { RebalanceScreen } from "@/features/rebalance/RebalanceScreen";
import { StartScreen } from "@/features/start/StartScreen";
import { type Lang, useI18n } from "@/i18n";
import { href, type Route, useRoute } from "@/lib/router";
import { useTheme } from "@/lib/theme";

const SCREENS: Record<Route, () => ReactNode> = {
  "/": StartScreen,
  "/portfolio": PortfolioScreen,
  "/edit": EditScreen,
  "/rebalance": RebalanceScreen,
  "/data": DataScreen,
};

export function App() {
  const route = useRoute();
  const { t, lang, setLang } = useI18n();
  const { dark, toggle } = useTheme();
  const session = useSession();
  const Screen = SCREENS[route];
  const hasSwitcher = session.portfolios.length > 0 || session.isDemo;

  const nav = (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6 text-lg font-bold tracking-tight">{t.app.name}</div>
      <SidebarNav
        aria-label={t.nav.openGroup}
        currentHref={href(route)}
        groups={[
          {
            title: t.nav.openGroup,
            items: (
              [
                ["/", t.nav.start],
                ["/portfolio", t.nav.portfolio],
                ["/edit", t.nav.edit],
                ["/rebalance", t.nav.rebalance],
                ["/data", t.nav.data],
              ] as const
            ).map(([r, label]) => ({ id: r, label, href: href(r) })),
          },
        ]}
      />
      {/* Always visible: where the data lives and how to keep a copy. */}
      <div className="mt-auto space-y-3 border-t border-border p-4">
        <p className="text-xs text-muted-foreground">{t.app.storageNotice}</p>
        <Button
          size="sm"
          variant="quiet"
          className="w-full"
          disabled={session.portfolios.length === 0}
          onClick={() => downloadBackup(session.portfolios)}
        >
          {t.app.exportBackup}
        </Button>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <DashboardShell
        sidebar={nav}
        mobileSidebar={nav}
        topbar={
          <>
            {!hasSwitcher && <span className="font-bold md:hidden">{t.app.name}</span>}
            <div className="min-w-0 flex-1">
              <PortfolioSwitcher />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Segmented<Lang>
                aria-label={t.nav.language}
                value={lang}
                onChange={setLang}
                options={[
                  { value: "pl", label: "PL" },
                  { value: "en", label: "EN" },
                ]}
              />
              <Button
                variant="quiet"
                size="icon-sm"
                aria-label={t.nav.theme}
                aria-pressed={dark}
                onClick={toggle}
              >
                {dark ? "☀" : "☾"}
              </Button>
            </div>
          </>
        }
      >
        {session.ready ? (
          <Screen />
        ) : (
          <p className="text-sm text-muted-foreground">{t.app.loading}</p>
        )}
      </DashboardShell>
    </ToastProvider>
  );
}
