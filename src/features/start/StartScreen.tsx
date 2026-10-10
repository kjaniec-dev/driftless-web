import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@kjaniec-dev/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/i18n";
import { navigate } from "@/lib/router";

export function StartScreen() {
  const { t } = useI18n();
  return (
    <>
      <ScreenHeader
        eyebrow={t.app.tagline}
        title={t.start.title}
        description={t.start.description}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t.start.privacyTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="info">{t.start.privacyBody}</Alert>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => navigate("/portfolio")}>{t.start.demo}</Button>
              <Button variant="outline" disabled>
                {t.start.newPortfolio}
              </Button>
              <Button variant="outline" disabled>
                {t.start.importJson}
              </Button>
              <Badge variant="neutral">{t.start.soon}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
