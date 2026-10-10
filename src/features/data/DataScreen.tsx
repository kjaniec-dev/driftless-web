import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from "@kjaniec-dev/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/i18n";

export function DataScreen() {
  const { t } = useI18n();
  return (
    <>
      <ScreenHeader title={t.data.title} description={t.data.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.data.principlesTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {t.data.principles.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.data.storageTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="warning">{t.data.storageBody}</Alert>
            <Button variant="outline" disabled>
              {t.data.backupSoon}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
