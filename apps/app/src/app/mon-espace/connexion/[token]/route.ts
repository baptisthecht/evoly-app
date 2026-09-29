import { openParticipantSession } from "@/server/participant";

export const dynamic = "force-dynamic";

/** Lien de connexion reçu par e-mail : ouvre l'espace participant sur cet appareil. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await openParticipantSession(token);
  return Response.redirect(new URL(ok ? "/mon-espace" : "/mon-espace?lien=expire", req.url), 303);
}
