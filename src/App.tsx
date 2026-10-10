import { DashboardShell, Segmented, SidebarNav, ToastProvider } from "@kjaniec-dev/ui";
import { type ReactNode, useEffect, useRef } from "react";
import { useSession } from "@/app/session";
import { downloadBackup } from "@/backup/actions";
import { Button } from "@/components/Button";
import { PortfolioSwitcher } from "@/components/PortfolioSwitcher";
import { focusMain, SkipLink } from "@/components/SkipLink";
import { DataScreen } from "@/features/data/DataScreen";
import { EditScreen } from "@/features/edit/EditScreen";
import { PortfolioScreen } from "@/features/portfolio/PortfolioScreen";
import { PrivacyScreen } from "@/features/privacy/PrivacyScreen";
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
  "/privacy": PrivacyScreen,
};

export function App() {
  const route = useRoute();
  const { t, lang, setLang } = useI18n();
  const { dark, toggle } = useTheme();
  const session = useSession();
  const Screen = SCREENS[route];

  // After a navigation the shell remounts (see below), which drops the focused nav link; move
  // focus to the new screen's heading. Not on first load, so we never steal focus from the page.
  const firstRoute = useRef(route);
  useEffect(() => {
    if (route !== firstRoute.current) focusMain();
  }, [route]);
  const hasSwitcher = session.portfolios.length > 0 || session.isDemo;

  const nav = (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6 text-lg font-bold tracking-tight">{t.app.name}</div>
      <SidebarNav
        aria-label={t.nav.openGroup}
        currentHref={href(route)}
        groups={[
          {
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
        <a
          href={href("/privacy")}
          className="block text-xs font-semibold text-foreground underline underline-offset-2"
        >
          {t.nav.privacy}
        </a>
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
      <SkipLink />
      <DashboardShell
        // Remount on navigation: the shell owns the mobile drawer's open state and offers no way to
        // close it from a link, so without this the drawer would keep covering the new screen.
        key={route}
        sidebar={nav}
        mobileSidebar={nav}
        topbar={
          <>
            {!hasSwitcher && <span className="font-bold md:hidden">{t.app.name}</span>}
            <div className="min-w-0 flex-1">
              <PortfolioSwitcher />
            </div>
            <div className="flex shrink-0 items-center gap-1">
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
