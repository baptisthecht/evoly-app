import { appleCredentials } from "@/server/wallet/apple";
import { passAuthorized, registerDevice, unregisterDevice } from "@/server/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { params: Promise<{ device: string; passType: string; serial: string }> };
const allowed = (req: Request, passType: string, serial: string) =>
  appleCredentials()?.passTypeIdentifier === passType && passAuthorized(serial, req.headers.get("authorization"));

/** RG-POST-04 : un téléphone s'inscrit aux mises à jour d'un pass. */
export async function POST(req: Request, { params }: P) {
  const { device, passType, serial } = await params;
  if (!allowed(req, passType, serial)) return new Response(null, { status: 401 });
  const body = (await req.json().catch(() => null)) as { pushToken?: unknown } | null;
  if (typeof body?.pushToken !== "string" || body.pushToken.length === 0 || body.pushToken.length > 200) return new Response(null, { status: 400 });
  const r = await registerDevice(device.slice(0, 200), serial, body.pushToken);
  return new Response(null, { status: r === "CREATED" ? 201 : r === "EXISTS" ? 200 : 401 });
}

/** Le pass a été retiré du téléphone. */
export async function DELETE(req: Request, { params }: P) {
  const { device, passType, serial } = await params;
  if (!allowed(req, passType, serial)) return new Response(null, { status: 401 });
  await unregisterDevice(device, serial);
  return new Response(null, { status: 200 });
}
