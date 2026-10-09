import { openingCalendar, openingIcs } from "@/server/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ajout à l'agenda de l'ouverture des ventes (RG-PRG-05) : public, sans rien révéler d'un événement invisible ou privé. */
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const lang = new URL(req.url).searchParams.get("lang") ?? "fr";
  const info = await openingCalendar(eventId.slice(0, 40), lang);
  if (!info) return new Response("Introuvable", { status: 404 });
  return new Response(openingIcs(info), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ouverture-des-ventes.ics"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
