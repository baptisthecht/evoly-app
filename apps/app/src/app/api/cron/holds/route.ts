import { env } from "@/lib/env";
import { releaseExpiredHolds } from "@/server/checkout";
import { expireResaleListings } from "@/server/resale";
import { applyTimedDowngrades } from "@/server/billing";
import { fillMissingStripeFees } from "@/server/orders";
import { dispatchWaitlist } from "@/server/waitlist";
import { releaseExpiredShopHolds } from "@/server/shopCheckout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-BUY-02 : tâche lancée chaque minute par le planificateur, avec Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Non autorisé", { status: 401 });
  // RG-BUY-02 et RG-RSL-08 : réservations expirées libérées, annonces de revente closes à la fin de la revente
  return Response.json({
    released: await releaseExpiredHolds(),
    shopReleased: await releaseExpiredShopHolds(), // boutique : produits retenus libérés (RG-SHOP-07)
    waitlist: await dispatchWaitlist(), // section 9.30 : places libérées proposées aux inscrits
    expiredListings: await expireResaleListings(),
    downgraded: await applyTimedDowngrades(),
    stripeFees: await fillMissingStripeFees(),
  });
}
