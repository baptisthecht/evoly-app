import { appleCredentials } from "@/server/wallet/apple";
import { updatedSerials } from "@/server/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-POST-04 : passes de ce téléphone modifiés depuis sa dernière synchronisation. */
export async function GET(req: Request, { params }: { params: Promise<{ device: string; passType: string }> }) {
  const { device, passType } = await params;
  if (appleCredentials()?.passTypeIdentifier !== passType) return new Response(null, { status: 404 });
  const r = await updatedSerials(device, new URL(req.url).searchParams.get("passesUpdatedSince"));
  return r ? Response.json(r) : new Response(null, { status: 204 });
}
