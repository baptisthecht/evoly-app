import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hit } from "@/server/rateLimit";
import { ipFrom } from "@/server/requestInfo";

/** Robots, aperçus de liens et navigateurs sans fenêtre (dont nos parcours de test) : jamais comptés. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|curl|wget|python|java\/|headless|lighthouse|pingdom/i;
const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Visite d'une billetterie (signal envoyé par la page après affichage) : un compteur par événement et par jour, sans
 * cookie ni donnée personnelle. Contre les gonflages : 20 visites par demi-heure et par visiteur, reconnu par une
 * empreinte brouillée de son adresse qui change chaque jour (l'adresse elle-même n'est jamais gardée).
 */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const none = new Response(null, { status: 204 });
  if (!/^c[a-z0-9]{20,32}$/.test(eventId) || BOT.test(req.headers.get("user-agent") ?? "") || req.headers.get("purpose") === "prefetch") return none;
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null, status: { in: ["PUBLISHED", "SALES_PAUSED"] } }, select: { id: true } });
  if (!event) return none;
  const today = day(new Date());
  const fingerprint = createHmac("sha256", `visites:${today.toISOString().slice(0, 10)}:${env().BETTER_AUTH_SECRET}`)
    .update(`${ipFrom(req.headers)}|${eventId}`)
    .digest("hex")
    .slice(0, 24);
  if ((await hit(`view:${fingerprint}`, 1800)) > 20) return none;
  await db.eventDailyStat.upsert({
    where: { eventId_date: { eventId, date: today } },
    create: { eventId, date: today, pageViews: 1 },
    update: { pageViews: { increment: 1 } },
  });
  return none;
}
