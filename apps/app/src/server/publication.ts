import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { CoreError, zonedLocalToUtc } from "@evoly/core";
import { db } from "@/lib/db";
import type { OrgContext } from "./context";
import { notify } from "./notifications";

/** Filtre des événements visibles du public : jamais avant leur date de publication programmée (RG-PRG-02). */
export function publiclyVisible(now = new Date()) {
  return { OR: [{ publishAt: null }, { publishAt: { lte: now } }] };
}

async function ownEvent(ctx: OrgContext, eventId: string) {
  const event = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null } });
  if (!event) throw new CoreError("NOT_FOUND");
  return event;
}

export type PublicationInput = { publishLocal: string | null; mode: "HIDDEN" | "TEASER"; teaserText: string | null };

/**
 * RG-PRG-01 : la date est saisie à l'heure du lieu de l'événement et doit précéder son début ; texte d'annonce de 160 caractères au plus.
 * Une date déjà passée publie aussitôt, sans e-mail « événement publié » : l'organisateur vient de le faire lui-même.
 */
export async function savePublication(ctx: OrgContext, eventId: string, input: PublicationInput, now = new Date()) {
  const event = await ownEvent(ctx, eventId);
  const publishAt = input.publishLocal ? zonedLocalToUtc(input.publishLocal, event.timezone) : null;
  if (publishAt && publishAt >= event.startsAt) throw new CoreError("PUBLISH_AFTER_START");
  const teaserText = input.teaserText?.trim() ? input.teaserText.trim().slice(0, 160) : null;
  const changed = (publishAt?.getTime() ?? null) !== (event.publishAt?.getTime() ?? null);
  return db.event.update({
    where: { id: event.id },
    data: {
      publishAt,
      prePublishMode: input.mode,
      teaserText,
      ...(changed ? { publishNotifiedAt: publishAt && publishAt > now ? null : now } : {}),
    },
  });
}

/** Lien d'aperçu secret : la page complète, sans achat, pour l'équipe et les partenaires (RG-PRG-03). */
export async function createPreviewToken(ctx: OrgContext, eventId: string) {
  const event = await ownEvent(ctx, eventId);
  if (event.previewToken) return event.previewToken;
  const token = randomBytes(18).toString("base64url");
  await db.event.update({ where: { id: event.id }, data: { previewToken: token } });
  return token;
}

export async function revokePreviewToken(ctx: OrgContext, eventId: string) {
  const event = await ownEvent(ctx, eventId);
  await db.event.update({ where: { id: event.id }, data: { previewToken: null } });
}

/** Comparaison en temps constant du jeton d'aperçu. */
export function previewAllowed(event: { previewToken: string | null }, token: string | null | undefined) {
  if (!event.previewToken || !token) return false;
  const a = Buffer.from(event.previewToken),
    b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tâche planifiée (chaque minute) : prévient l'organisation quand un événement programmé devient public, une seule fois. */
export async function notifyPublishedEvents(now = new Date()) {
  const due = await db.event.findMany({
    where: { publishAt: { lte: now }, publishNotifiedAt: null, status: "PUBLISHED", deletedAt: null },
    select: { id: true, title: true, organizationId: true },
    take: 100,
  });
  let notified = 0;
  for (const e of due) {
    const claimed = await db.event.updateMany({ where: { id: e.id, publishNotifiedAt: null }, data: { publishNotifiedAt: now } });
    if (claimed.count === 0) continue; // déjà pris par une exécution parallèle
    await notify(e.organizationId, "EVENT_PUBLISHED", {
      title: e.title,
      body: "Votre événement est maintenant public : sa page est en ligne.",
      link: `/events/${e.id}`,
    });
    notified++;
  }
  return notified;
}
