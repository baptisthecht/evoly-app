import "server-only";
import { checkSubdomain } from "@evoly/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export type SubdomainAvailability = { ok: true; value: string } | { ok: false; reason: "LENGTH" | "FORMAT" | "RESERVED" | "TAKEN" };

/** RG-SDM-01 à 03 : format, liste réservée, et libre dans les organisations, événements et redirections actives. */
export async function subdomainAvailability(input: string, exceptOrganizationId?: string): Promise<SubdomainAvailability> {
  const check = checkSubdomain(input);
  if (!check.ok) return check;
  const value = check.value;
  const [org, event, redirect] = await Promise.all([
    db.organization.findFirst({ where: { subdomain: value, NOT: exceptOrganizationId ? { id: exceptOrganizationId } : undefined }, select: { id: true } }),
    db.event.findFirst({ where: { subdomain: value }, select: { id: true } }),
    db.hostRedirect.findFirst({ where: { host: `${value}.${env().NEXT_PUBLIC_BASE_DOMAIN}`, expiresAt: { gt: new Date() }, NOT: exceptOrganizationId ? { organizationId: exceptOrganizationId } : undefined }, select: { id: true } }),
  ]);
  if (org || event || redirect) return { ok: false, reason: "TAKEN" };
  return { ok: true, value };
}
