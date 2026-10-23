import { embedOriginsFor } from "@/server/embed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sites autorisés à afficher le module d'un événement (section 9.26), lus par l'intercepteur ; aucune donnée sensible. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  return Response.json(
    { origins: await embedOriginsFor(eventId.slice(0, 40)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
