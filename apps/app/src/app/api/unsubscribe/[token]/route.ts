import { applyUnsubscribe, readUnsubscribeToken } from "@/server/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 8058 : désinscription en un clic envoyée par la messagerie (List-Unsubscribe-Post). */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = readUnsubscribeToken(token);
  if (!data) return new Response("Lien invalide", { status: 400 });
  await applyUnsubscribe(token, data.eventId ? "EVENT" : "ORGANIZATION");
  return new Response("ok");
}
