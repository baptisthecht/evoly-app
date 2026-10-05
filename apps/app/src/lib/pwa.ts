import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

/**
 * Vrai sur l'hôte de l'app (app.evoly.me) : seul hôte installable comme application.
 * Jamais sur les billetteries des organisateurs (leurs acheteurs ne doivent pas se voir proposer « Evoly ») ni sur le scanner.
 */
export async function isAppHost(): Promise<boolean> {
  return (await headers()).get("host") === new URL(env().NEXT_PUBLIC_APP_URL).host;
}
