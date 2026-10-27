import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EventSettingsSection } from "./EventSettingsSection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settingsGeneral") };
}

/** Réglages d'un événement, l'essentiel. */
export default async function EventSettingsGeneral({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  return (
    <EventSettingsSection
      orgSlug={orgSlug}
      eventId={eventId}
      section="general"
    />
  );
}
