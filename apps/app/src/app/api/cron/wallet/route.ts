import { env } from "@/lib/env";
import { syncWalletPasses } from "@/server/wallet/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toutes les 5 minutes (RG-POST-04) : passes Apple et Google Wallet modifiés renvoyés aux téléphones. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Non autorisé", { status: 401 });
  return Response.json(await syncWalletPasses());
}
