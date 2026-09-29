import "server-only";
import { checkSubdomain, CoreError, hasFeature, normalizeHexColor, secretToken, isSvg, sniffImage, svgIsSafe } from "@evoly/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { deletePublicFile, putPublicFile } from "./storage";
import { ensurePaymentDomains } from "./stripeConnect";

const MAX_BYTES = { logo: 2_000_000, favicon: 500_000, cover: 5_000_000, campaign: 5_000_000 } as const;
export type UploadKind = keyof typeof MAX_BYTES;

/** Import d'une image : type réel vérifié, taille limitée, clé aléatoire (le nom du fichier d'origine n'est jamais repris). */
export async function uploadImage(ctx: OrgContext, kind: UploadKind, bytes: Uint8Array, eventId?: string | null): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_BYTES[kind]) throw new CoreError("UPLOAD_TOO_LARGE");
  let type = sniffImage(bytes);
  if (!type && isSvg(bytes)) {
    // RG-FILE-01 : SVG vérifié puis converti en PNG (jamais conservé tel quel : aucun script possible)
    if (!svgIsSafe(new TextDecoder().decode(bytes))) throw new CoreError("UPLOAD_SVG_UNSAFE");
    const sharp = (await import("sharp")).default;
    const width = kind === "favicon" ? 256 : kind === "logo" ? 1024 : kind === "campaign" ? 1200 : 1600;
    try {
      bytes = new Uint8Array(await sharp(Buffer.from(bytes), { density: 300, limitInputPixels: 40_000_000 }).resize({ width, fit: "inside", withoutEnlargement: false }).png().toBuffer());
    } catch {
      throw new CoreError("UPLOAD_TYPE");
    }
    type = "image/png";
  }
  if (!type) throw new CoreError("UPLOAD_TYPE");
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  if (kind === "cover") {
    const event = await db.event.findFirst({ where: { id: eventId ?? "", organizationId: ctx.organization.id }, select: { id: true } });
    if (!event) throw new CoreError("NOT_FOUND");
    return putPublicFile(`events/${event.id}/cover-${secretToken(9).toLowerCase().replace(/[^a-z0-9]/g, "")}.${ext}`, bytes, type);
  }
  return putPublicFile(`orgs/${ctx.organization.id}/${kind}-${secretToken(9).toLowerCase().replace(/[^a-z0-9]/g, "")}.${ext}`, bytes, type);
}

export interface BrandInput {
  displayName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  emailFromName?: string | null;
  emailReplyTo?: string | null;
  hideEvolyBranding: boolean;
}

/** US-BRD-01, US-BRD-02 (Pro) : configurateur de marque. Le contraste du texte est choisi automatiquement à l'affichage (RG-BRD-01). */
export async function saveBrand(ctx: OrgContext, input: BrandInput) {
  if (!hasFeature(ctx.features, "BRANDING")) throw new CoreError("PRO_REQUIRED");
  const own = (u?: string | null) => (!u ? null : u.startsWith(env().R2_PUBLIC_URL ?? "\u0000") || u.startsWith(`${env().NEXT_PUBLIC_APP_URL}/files/`) ? u : null);
  const colors = { primaryColor: normalizeHexColor(input.primaryColor), accentColor: normalizeHexColor(input.accentColor) };
  if ((input.primaryColor && !colors.primaryColor) || (input.accentColor && !colors.accentColor)) throw new CoreError("BRAND_COLOR_INVALID");
  const before = await db.organizationBrand.findUnique({ where: { organizationId: ctx.organization.id } });
  const data = {
    displayName: input.displayName?.trim() || null,
    logoUrl: own(input.logoUrl),
    faviconUrl: own(input.faviconUrl),
    ...colors,
    emailFromName: input.emailFromName?.trim() || null,
    emailReplyTo: input.emailReplyTo?.trim().toLowerCase() || null,
    hideEvolyBranding: hasFeature(ctx.features, "REMOVE_EVOLY_BRANDING") ? input.hideEvolyBranding : false,
  };
  const brand = await db.organizationBrand.upsert({ where: { organizationId: ctx.organization.id }, create: { organizationId: ctx.organization.id, ...data }, update: data });
  if (before?.logoUrl && before.logoUrl !== brand.logoUrl) await deletePublicFile(before.logoUrl);
  if (before?.faviconUrl && before.faviconUrl !== brand.faviconUrl) await deletePublicFile(before.faviconUrl);
  await audit({ action: "brand.updated", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "OrganizationBrand", targetId: brand.id });
  return brand;
}

const host = (sub: string) => `${sub}.${env().NEXT_PUBLIC_BASE_DOMAIN}`;

/** RG-SDM-01 : format, liste réservée, et disponibilité sur toute la plateforme (organisations, événements, anciennes adresses). */
export async function subdomainAvailable(value: string, opts: { organizationId?: string; eventId?: string } = {}) {
  const check = checkSubdomain(value);
  if (!check.ok) return { ok: false as const, reason: check.reason };
  const [org, event, redirect] = await Promise.all([
    db.organization.findFirst({ where: { subdomain: check.value, ...(opts.organizationId ? { id: { not: opts.organizationId } } : {}) }, select: { id: true } }),
    db.event.findFirst({ where: { subdomain: check.value, ...(opts.eventId ? { id: { not: opts.eventId } } : {}) }, select: { id: true } }),
    db.hostRedirect.findFirst({ where: { host: host(check.value), expiresAt: { gt: new Date() }, ...(opts.organizationId ? { organizationId: { not: opts.organizationId } } : {}) }, select: { id: true } }),
  ]);
  if (org || event || redirect) return { ok: false as const, reason: "TAKEN" as const };
  return { ok: true as const, value: check.value };
}

/** RG-SDM-03 : changement de l'adresse de l'organisation, l'ancienne redirige en 301 pendant 6 mois. */
export async function changeOrganizationSubdomain(ctx: OrgContext, value: string, now = new Date()) {
  const available = await subdomainAvailable(value, { organizationId: ctx.organization.id });
  if (!available.ok) throw new CoreError(`SUBDOMAIN_${available.reason}`);
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { subdomain: true } });
  if (org.subdomain === available.value) return;
  const expiresAt = new Date(now.getTime() + 183 * 86_400_000);
  await db.$transaction([
    db.organization.update({ where: { id: ctx.organization.id }, data: { subdomain: available.value } }),
    db.hostRedirect.deleteMany({ where: { host: host(available.value), organizationId: ctx.organization.id } }), // reprise d'une ancienne adresse
    ...(org.subdomain ? [db.hostRedirect.upsert({ where: { host: host(org.subdomain) }, create: { host: host(org.subdomain), organizationId: ctx.organization.id, expiresAt }, update: { organizationId: ctx.organization.id, eventId: null, expiresAt } })] : []),
  ]);
  await audit({ action: "organization.subdomain_changed", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Organization", targetId: ctx.organization.id, metadata: { from: org.subdomain, to: available.value } });
  await ensurePaymentDomains(ctx.organization.id).catch(() => undefined);
}

/** US-BRD-05 (Pro) : sous-domaine dédié à un événement, unique sur toute la plateforme. */
export async function setEventSubdomain(ctx: OrgContext, eventId: string, value: string | null) {
  if (!hasFeature(ctx.features, "EVENT_SUBDOMAINS")) throw new CoreError("PRO_REQUIRED");
  const event = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organization.id }, select: { id: true } });
  if (!event) throw new CoreError("NOT_FOUND");
  if (!value) {
    await db.event.update({ where: { id: event.id }, data: { subdomain: null } });
    return null;
  }
  const available = await subdomainAvailable(value, { eventId: event.id });
  if (!available.ok) throw new CoreError(`SUBDOMAIN_${available.reason}`);
  await db.event.update({ where: { id: event.id }, data: { subdomain: available.value } });
  await ensurePaymentDomains(ctx.organization.id).catch(() => undefined);
  return available.value;
}
