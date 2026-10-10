import { Button, DashboardShell, Segmented, SidebarNav, ToastProvider } from "@kjaniec-dev/ui";
import type { ReactNode } from "react";
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
  const Screen = SCREENS[route];

  const nav = (
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
  );

  return (
    <ToastProvider>
      <DashboardShell
        sidebar={
          <>
            <div className="px-6 pt-6 text-lg font-bold tracking-tight">{t.app.name}</div>
            {nav}
          </>
        }
        mobileSidebar={nav}
        topbar={
          <>
            <span className="font-bold md:hidden">{t.app.name}</span>
            <div className="ml-auto flex items-center gap-3">
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
                variant="ghost"
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
        <Screen />
      </DashboardShell>
    </ToastProvider>
  );
}
