import "server-only";
import { effectivePlan, hasFeature, sniffImage } from "@evoly/core";
import { BRAND_FONTS, controlRadiusFor, inkOn, isBrandFont } from "@evoly/ui";
import { db } from "@/lib/db";
import { getPlans } from "../plans";
import { publicFileUrl, readLocalFile } from "../storage";
import { PLAN_SUBSCRIPTION_SELECT } from "@/server/planSelect";

export interface EmailBrand {
  fromName: string;
  replyTo?: string;
  logoUrl: string | null;
  accent: string | null;
  accentInk: string | null;
  primary: string | null;
  primaryInk: string | null;
  showPoweredBy: boolean;
  /** Arrondi des boutons (réglage de la marque, sinon la pilule). */
  buttonRadius: string;
  /** Police des titres de la marque, avec des polices de repli (les messageries chargent rarement les polices web). */
  headingFont: string | null;
}

/** RG-BRD-02 : marque de l'organisation dans les e-mails aux acheteurs et les PDF (Pro), sinon thème Evoly (RG-BRD-03). */
export async function emailBrandFor(organizationId: string): Promise<EmailBrand> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      name: true,
      contactEmail: true,
      brand: true,
      subscription: { select: PLAN_SUBSCRIPTION_SELECT },
    },
  });
  const features = (await getPlans())[effectivePlan(org.subscription, new Date())].features;
  const b = hasFeature(features, "BRANDING") ? org.brand : null;
  const accent = b?.accentColor ?? b?.primaryColor ?? null;
  return {
    fromName: b?.emailFromName ?? b?.displayName ?? org.name,
    replyTo: b?.emailReplyTo ?? org.contactEmail ?? undefined,
    logoUrl: b?.logoUrl ?? null,
    accent,
    accentInk: accent ? inkOn(accent) : null,
    primary: b?.primaryColor ?? null,
    primaryInk: b?.primaryColor ? inkOn(b.primaryColor) : null,
    buttonRadius: controlRadiusFor(b?.radius),
    headingFont: b?.headingFont && isBrandFont(b.headingFont) ? BRAND_FONTS[b.headingFont].family : null,
    showPoweredBy: !(hasFeature(features, "REMOVE_EVOLY_BRANDING") && (org.brand?.hideEvolyBranding ?? true)),
  };
}

/** Octets du logo pour le PDF (PNG ou JPEG ; WebP non pris en charge par les PDF standard). */
export async function logoBytes(url: string | null): Promise<{ bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null> {
  if (!url) return null;
  try {
    const prefix = publicFileUrl("");
    let bytes: Uint8Array | null = null;
    if (url.startsWith(prefix)) bytes = (await readLocalFile(url.slice(prefix.length)))?.bytes ?? null;
    if (!bytes) {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    }
    const type = bytes ? sniffImage(bytes) : null;
    return bytes && (type === "image/png" || type === "image/jpeg") ? { bytes, type } : null;
  } catch {
    return null;
  }
}
