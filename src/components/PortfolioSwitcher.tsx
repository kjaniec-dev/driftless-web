import { Select } from "@kjaniec-dev/ui";
import { useSession } from "@/app/session";
import { useI18n } from "@/i18n";

export function PortfolioSwitcher() {
  const { t } = useI18n();
  const session = useSession();
  if (session.portfolios.length === 0 && !session.isDemo) return null;

  const value = session.isDemo ? "__demo__" : (session.active?.id ?? "");
  const currentName = session.isDemo ? t.nav.demoOption : (session.active?.name ?? "");
  return (
    <Select
      aria-label={t.nav.switcher}
      // Natural height (a fixed h-8 clipped the text); long names get an ellipsis, and the
      // full name stays available as a tooltip.
      className="max-w-64 truncate"
      title={currentName}
      value={value}
      onChange={(e) => {
        if (e.target.value === "__demo__") session.startDemo();
        else session.select(e.target.value);
      }}
    >
      {session.isDemo && <option value="__demo__">{t.nav.demoOption}</option>}
      {session.portfolios.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
