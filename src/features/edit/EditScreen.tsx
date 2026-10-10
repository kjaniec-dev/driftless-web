import { EmptyState } from "@kjaniec-dev/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/i18n";

export function EditScreen() {
  const { t } = useI18n();
  return (
    <>
      <ScreenHeader title={t.edit.title} description={t.edit.description} />
      <EmptyState title={t.edit.emptyTitle} description={t.edit.emptyBody} />
    </>
  );
}
