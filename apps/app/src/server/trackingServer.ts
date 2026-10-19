import { CONSENT_COOKIE, EVENT_COOKIE, parseAcquisition, parseConsent, parseEvents, SOURCE_COOKIE, type Acquisition, type TrackedEvent } from "@evoly/core";
import { cookies } from "next/headers";

/** Source de la première visite, lue dans le cookie (bornée, champs connus seulement) ; aucune si absente ou illisible. */
export async function readAcquisition(): Promise<Acquisition | null> {
  return parseAcquisition((await cookies()).get(SOURCE_COOKIE)?.value);
}

/**
 * Événement confirmé par le serveur, transmis à la page suivante par un cookie de dix minutes : elle l'envoie à Google
 * Analytics et Google Ads seulement si l'internaute y a consenti, puis l'efface.
 */
export async function queueTrackedEvent(event: TrackedEvent) {
  const jar = await cookies();
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  if (!consent?.analytics && !consent?.ads) return; // sans consentement, aucun cookie de mesure
  const events = [...new Set([...parseEvents(jar.get(EVENT_COOKIE)?.value), event])];
  jar.set(EVENT_COOKIE, events.join(","), { maxAge: 600, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: false });
}
