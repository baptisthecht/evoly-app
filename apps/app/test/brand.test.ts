import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { changeOrganizationSubdomain, setEventSubdomain, subdomainAvailable, uploadImage } from "@/server/brand";
import { canonicalEventUrl } from "@/server/canonical";
import type { OrgContext } from "@/server/context";
import { addCustomDomain, isHostAllowed, verifyCustomDomain } from "@/server/domains";
import { getPlans } from "@/server/plans";
import { resolveSite } from "@/server/publicEvents";
import { readLocalFile } from "@/server/storage";

const rid = () => Math.random().toString(36).slice(2, 10);
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBmgAhgYAAAAAP//AwBfDQX/AAAAAElFTkSuQmCC", "base64"));

async function setup(plan: "free" | "pro") {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({ data: { name: `Asso ${id}`, slug: `asso-${id}`, subdomain: `asso-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, roleId: (await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } })).id, status: "ACTIVE" } });
  if (plan === "pro") await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } });
  const event = await db.event.create({ data: { organizationId: org.id, slug: `gala-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Gala ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 9 * 86_400_000), status: "PUBLISHED" } });
  const features = (await getPlans())[plan].features;
  const ctx = { organization: { id: org.id, slug: org.slug, subdomain: org.subdomain, name: org.name }, user: { id: user.id }, features } as unknown as OrgContext;
  return { id, org, event, ctx, features };
}
const resolver = (records: Record<string, string[]>) => ({ resolveCname: async (h: string) => { if (!records[h]) throw Object.assign(new Error("absent"), { code: "ENODATA" }); return records[h]!; } });

describe("sous-domaines et domaines (section 9.19)", () => {
  it("résolution : organisation, événement en Pro, retour en Free, ancienne adresse redirigée", async () => {
    const s = await setup("pro");
    expect((await resolveSite(s.org.subdomain!))?.kind).toBe("ORG");
    await setEventSubdomain(s.ctx, s.event.id, `nuit-${s.id}`);
    expect(await resolveSite(`nuit-${s.id}`)).toMatchObject({ kind: "EVENT", eventId: s.event.id });
    await db.subscription.update({ where: { organizationId: s.org.id }, data: { status: "CANCELED", currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect(await resolveSite(`nuit-${s.id}`)).toMatchObject({ kind: "REDIRECT", rootPath: `/${s.event.slug}` });
    await changeOrganizationSubdomain(s.ctx, `neuf-${s.id}`);
    expect(await resolveSite(s.org.subdomain!)).toMatchObject({ kind: "REDIRECT", base: expect.stringContaining(`neuf-${s.id}.`) });
    expect(await subdomainAvailable(s.org.subdomain!)).toMatchObject({ ok: false, reason: "TAKEN" });
    expect(await subdomainAvailable("scanner")).toMatchObject({ ok: false, reason: "RESERVED" });
    expect(await resolveSite(`inconnu-${s.id}`)).toBeNull();
  });

  it("domaine personnalisé : vérification DNS, portée événement, désactivé en Free, hôtes autorisés", async () => {
    const s = await setup("pro");
    const d = await addCustomDomain(s.ctx, `https://Billetterie-${s.id}.Exemple.BE/`, "EVENT", s.event.id);
    expect(d).toMatchObject({ domain: `billetterie-${s.id}.exemple.be`, status: "PENDING_DNS" });
    await expect(addCustomDomain(s.ctx, "asso.evoly.me", "ORGANIZATION")).rejects.toThrow("DOMAIN_RESERVED"); // les adresses d'Evoly ne se connectent pas
    expect((await verifyCustomDomain(d.id, resolver({ [d.domain]: ["ailleurs.example.com"] }))).lastError).toBe("WRONG_TARGET:ailleurs.example.com");
    expect((await verifyCustomDomain(d.id, resolver({}))).lastError).toBe("DNS_NOT_FOUND");
    expect(await isHostAllowed(d.domain)).toBe(false);
    expect(await verifyCustomDomain(d.id, resolver({ [d.domain]: [`${d.dnsTarget}.`] }))).toMatchObject({ status: "ACTIVE", lastError: null });
    expect(await isHostAllowed(d.domain)).toBe(true);
    expect(await resolveSite(`_d_${d.domain}`)).toMatchObject({ kind: "EVENT", eventId: s.event.id });
    expect(await canonicalEventUrl({ ...s.org, features: s.features }, s.event)).toMatch(new RegExp(`^https?://billetterie-${s.id}\\.exemple\\.be`));
    await db.subscription.update({ where: { organizationId: s.org.id }, data: { status: "CANCELED", currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect(await resolveSite(`_d_${d.domain}`)).toMatchObject({ kind: "DISABLED", fallback: expect.stringContaining(`asso-${s.id}.`) });
    expect(await resolveSite(`_d_inconnu-${s.id}.example.com`)).toEqual({ kind: "DISABLED", fallback: null });
  });

  it("vérifications arrêtées après 48 heures, propriétaire prévenu", async () => {
    const s = await setup("pro");
    const d = await addCustomDomain(s.ctx, `tickets-${s.id}.exemple.be`, "ORGANIZATION");
    const later = new Date(Date.now() + 49 * 3_600_000);
    expect(await verifyCustomDomain(d.id, resolver({}), later)).toMatchObject({ status: "ERROR", lastError: "DNS_NOT_FOUND" });
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "domain.checks_stopped" } })).toBe(1);
  });

  it("adresse canonique : domaine personnalisé, puis sous-domaine d'événement, puis sous-domaine de l'organisation (RG-DOM-06)", async () => {
    const s = await setup("pro");
    const org = { ...s.org, features: s.features };
    expect(await canonicalEventUrl(org, s.event)).toMatch(new RegExp(`asso-${s.id}\\..*/${s.event.slug}$`));
    await setEventSubdomain(s.ctx, s.event.id, `soir-${s.id}`);
    const withSub = { ...s.event, subdomain: `soir-${s.id}` };
    expect(await canonicalEventUrl(org, withSub)).toMatch(new RegExp(`soir-${s.id}\\.`));
    const shared = await addCustomDomain(s.ctx, `www-${s.id}.exemple.be`, "ORGANIZATION");
    await db.customDomain.update({ where: { id: shared.id }, data: { status: "ACTIVE" } });
    expect(await canonicalEventUrl(org, withSub)).toMatch(new RegExp(`www-${s.id}\\.exemple\\.be.*/${s.event.slug}$`));
    const own = await addCustomDomain(s.ctx, `gala-${s.id}.exemple.be`, "EVENT", s.event.id);
    await db.customDomain.update({ where: { id: own.id }, data: { status: "ACTIVE" } });
    expect(await canonicalEventUrl(org, withSub)).toMatch(new RegExp(`gala-${s.id}\\.exemple\\.be(:\\d+)?$`));
  });

  it("import d'images : type réel vérifié, SVG dangereux et fichiers trop lourds refusés", async () => {
    const s = await setup("pro");
    const url = await uploadImage(s.ctx, "logo", PNG);
    expect(url).toMatch(/\/files\/orgs\/.+\/logo-[a-z0-9]+\.png$/);
    const key = url.split("/files/")[1]!;
    expect((await readLocalFile(key))?.contentType).toBe("image/png");
    // RG-FILE-01 : un SVG sûr est converti en PNG ; un SVG avec gestionnaire d'événement est refusé
    await expect(uploadImage(s.ctx, "logo", new TextEncoder().encode("<svg onload=alert(1)>"))).rejects.toThrow("UPLOAD_SVG_UNSAFE");
    await expect(uploadImage(s.ctx, "favicon", new Uint8Array(600_000).fill(0x89))).rejects.toThrow("UPLOAD_TOO_LARGE");
  });
});
