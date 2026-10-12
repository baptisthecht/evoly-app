import "server-only";
import { CoreError, effectivePlan, hasFeature } from "@evoly/core";
import { db } from "@/lib/db";
import type { OrgContext } from "./context";
import { getPlans } from "./plans";

/** Billetterie intégrable (section 9.26, Pro) : sites autorisés à afficher le module, en HTTPS. */
export const MAX_EMBED_ORIGINS = 10;

/** « monclub.be/billets » → « https://monclub.be » ; null si l'adresse n'est pas un site HTTPS valable (RG-EMB-01). */
export function normalizeOrigin(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 200) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return `https://${host}${url.port ? `:${url.port}` : ""}`;
}

export async function addEmbedOrigin(ctx: OrgContext, input: string) {
  if (!hasFeature(ctx.features, "EMBED_WIDGET")) throw new CoreError("FEATURE_UNAVAILABLE");
  const origin = normalizeOrigin(input);
  if (!origin) throw new CoreError("EMBED_ORIGIN_INVALID");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { embedOrigins: true } });
  if (org.embedOrigins.includes(origin)) return org.embedOrigins;
  if (org.embedOrigins.length >= MAX_EMBED_ORIGINS) throw new CoreError("EMBED_TOO_MANY");
  const next = [...org.embedOrigins, origin];
  await db.organization.update({ where: { id: ctx.organization.id }, data: { embedOrigins: next } });
  return next;
}

export async function removeEmbedOrigin(ctx: OrgContext, origin: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { embedOrigins: true } });
  await db.organization.update({ where: { id: ctx.organization.id }, data: { embedOrigins: org.embedOrigins.filter((o) => o !== origin) } });
}

export async function listEmbedOrigins(ctx: OrgContext) {
  return (await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { embedOrigins: true } })).embedOrigins;
}

/** Pour l'intercepteur : sites autorisés d'un événement publié, si l'organisation a l'offre Pro ; aucun sinon. */
export async function embedOriginsFor(eventId: string, now = new Date()): Promise<string[]> {
  const e = await db.event.findFirst({
    where: { id: eventId, deletedAt: null, status: "PUBLISHED" },
    select: {
      organization: { select: { embedOrigins: true, subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } } } },
    },
  });
  if (!e) return [];
  const plans = await getPlans();
  return hasFeature(plans[effectivePlan(e.organization.subscription, now)].features, "EMBED_WIDGET") ? e.organization.embedOrigins : [];
}

/** Module intégrable : l'événement publié et l'adresse de sa page de vente, si l'organisation a l'offre Pro. */
export async function embedEventFor(eventId: string, now = new Date()) {
  const e = await db.event.findFirst({
    where: { id: eventId, deletedAt: null, status: "PUBLISHED" },
    select: {
      id: true,
      organization: {
        select: { slug: true, subdomain: true, subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } } },
      },
    },
  });
  if (!e) return null;
  const plans = await getPlans();
  return hasFeature(plans[effectivePlan(e.organization.subscription, now)].features, "EMBED_WIDGET") ? e : null;
}
