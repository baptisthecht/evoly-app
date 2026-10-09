import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { notificationPreferences } from "@/server/notifications";
import { PreferencesForm } from "./PreferencesForm";

export const dynamic = "force-dynamic";

/** Préférences de notification par membre (P1). */
export default async function NotificationPreferencesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("notifications");
  const prefs = await notificationPreferences(ctx.organization.id, ctx.user.id);
  if (!prefs) notFound();
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <h1 className="font-display text-3xl tracking-[-0.03em]">{t("prefsTitle")}</h1>
      <p className="text-sm text-ink-muted">{t("prefsIntro")}</p>
      <Card>
        <PreferencesForm
          orgSlug={orgSlug}
          rows={prefs.map((p) => ({ ...p, label: t(`type_${p.type}`) }))}
          labels={{ type: t("prefsType"), inApp: t("prefsInApp"), email: t("prefsEmail"), save: t("prefsSave"), saved: t("prefsSaved") }}
        />
      </Card>
    </div>
  );
}
