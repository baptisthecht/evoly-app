import { assertSiteRequest } from "@/server/siteGuard";
import { appleCredentials, buildPkpass } from "@/server/wallet/apple";
import { googleCredentials, googleSaveUrl } from "@/server/wallet/google";
import { walletTicket } from "@/server/wallet/ticket";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** US-POST-03 : un billet valable dans Apple Wallet (.pkpass signé) ou Google Wallet (lien d'enregistrement). */
export async function GET(req: Request, { params }: { params: Promise<{ sub: string; token: string; ticketId: string; provider: string }> }) {
  const { sub, token, ticketId, provider } = await params;
  await assertSiteRequest(sub);
  const ticket = await walletTicket(token, ticketId);
  if (!ticket) return new Response("Introuvable", { status: 404 });
  const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
  if (provider === "apple") {
    const creds = appleCredentials();
    if (!creds) return new Response("Apple Wallet n’est pas configuré", { status: 404 });
    return new Response(Buffer.from(buildPkpass(ticket, creds)), {
      headers: {
        ...headers,
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": `attachment; filename="billet-${ticket.shortCode}.pkpass"`,
      },
    });
  }
  if (provider === "google") {
    const creds = googleCredentials();
    if (!creds) return new Response("Google Wallet n’est pas configuré", { status: 404 });
    const origin = `${req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")}://${req.headers.get("host") ?? new URL(req.url).host}`;
    return new Response(null, { status: 303, headers: { ...headers, location: googleSaveUrl(ticket, creds, origin) } });
  }
  return new Response("Introuvable", { status: 404 });
}
