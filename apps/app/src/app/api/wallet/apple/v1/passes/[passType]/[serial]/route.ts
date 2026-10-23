import { appleCredentials } from "@/server/wallet/apple";
import { latestPass, passAuthorized } from "@/server/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-POST-04 : dernière version du pass, annulé si le billet a été désactivé. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ passType: string; serial: string }> },
) {
  const { passType, serial } = await params;
  if (
    appleCredentials()?.passTypeIdentifier !== passType ||
    !passAuthorized(serial, req.headers.get("authorization"))
  )
    return new Response(null, { status: 401 });
  const pass = await latestPass(serial);
  if (!pass) return new Response(null, { status: 404 });
  const since = req.headers.get("if-modified-since");
  if (
    since &&
    Date.parse(since) >= Math.floor(pass.lastModified.getTime() / 1000) * 1000
  )
    return new Response(null, { status: 304 });
  return new Response(Buffer.from(pass.bytes), {
    status: 200,
    headers: {
      "content-type": "application/vnd.apple.pkpass",
      "last-modified": pass.lastModified.toUTCString(),
    },
  });
}
