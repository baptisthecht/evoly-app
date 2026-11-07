import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { notificationPreferences } from "@/server/notifications";
import { PreferencesForm } from "./PreferencesForm";

export const dynamic = "force-dynamic";

/** Préférences de notification par membre (P1). */
export default async function NotificationPreferencesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("notifications");
  const prefs = await notificationPreferences(ctx.organization.id, ctx.user.id);
  if (!prefs) notFound();
  // refonte A3 : le titre est dans l'en-tête (Notifications, Préférences) ; l'explication, puis le tableau
  return (
    <div className="grid max-w-[720px] gap-3.5">
      <p className="text-[13px] text-ink-muted">{t("prefsIntro")}</p>
      <PreferencesForm
        orgSlug={orgSlug}
        rows={prefs.map((p) => ({
          ...p,
          label: t.has(`pref_${p.type}`)
            ? t(`pref_${p.type}`)
            : t(`type_${p.type}`),
        }))}
        labels={{
          type: t("prefsType"),
          inApp: t("prefsInApp"),
          email: t("prefsEmail"),
          save: t("prefsSave"),
          saved: t("prefsSaved"),
        }}
      />
    </div>
  );
}
