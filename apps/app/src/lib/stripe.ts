import "server-only";
import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | null | undefined;

/** Client Stripe du compte plateforme Evoly. null si Stripe n'est pas configuré (développement). */
export function stripe(): Stripe | null {
  if (client === undefined) {
    const key = env().STRIPE_SECRET_KEY;
    client = key ? new Stripe(key, { appInfo: { name: "Evoly", url: "https://evoly.me" } }) : null;
  }
  return client;
}
