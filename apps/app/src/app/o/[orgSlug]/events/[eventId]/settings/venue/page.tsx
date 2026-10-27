import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EventSettingsSection } from "../EventSettingsSection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settingsVenue") };
}

/** Réglages d'un événement, le lieu. */
export default async function EventSettingsVenue({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  return (
    <EventSettingsSection orgSlug={orgSlug} eventId={eventId} section="venue" />
  );
}
