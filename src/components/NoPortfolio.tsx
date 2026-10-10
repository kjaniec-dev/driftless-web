import { Button, EmptyState } from "@kjaniec-dev/ui";
import { useI18n } from "@/i18n";
import { navigate } from "@/lib/router";

export function NoPortfolio() {
  const { t } = useI18n();
  return (
    <EmptyState
      title={t.portfolio.noPortfolioTitle}
      description={t.portfolio.noPortfolioBody}
      action={<Button onClick={() => navigate("/")}>{t.portfolio.goStart}</Button>}
    />
  );
}
