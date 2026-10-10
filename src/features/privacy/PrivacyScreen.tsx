import { Card, CardContent } from "@kjaniec-dev/ui";
import { CardHeading } from "@/components/CardHeading";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/i18n";

/** The privacy policy. Its claims are checked against the build by scripts/audit-dist.mjs and the E2E suite. */
export function PrivacyScreen() {
  const { t } = useI18n();
  return (
    <>
      <ScreenHeader title={t.privacy.title} description={t.privacy.intro} />
      <p className="mb-6 text-sm text-muted-foreground">{t.privacy.updated}</p>
      <div className="grid gap-6">
        {t.privacy.sections.map((section) => (
          <Card key={section.heading}>
            <CardContent className="space-y-3 pt-6">
              <CardHeading>{section.heading}</CardHeading>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
