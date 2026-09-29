import "server-only";
import { notify } from "./notifications";
import { promises as dns } from "node:dns";
import { CoreError, hasFeature, normalizeDomain, secretToken } from "@evoly/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { sendEmail } from "./email/send";
import { ensurePaymentDomains } from "./stripeConnect";

export const MAX_CUSTOM_DOMAINS = 10; // RG-CDM-01
const CHECK_WINDOW_MS = 48 * 3_600_000;

export const dnsTarget = () => env().CUSTOM_DOMAIN_TARGET ?? `domains.${env().NEXT_PUBLIC_BASE_DOMAIN.split(":")[0]}`;

/** Résolveur DNS, remplaçable dans les tests. */
export interface CnameResolver {
  resolveCname(host: string): Promise<string[]>;
}

/** Section 9.19, étape 1 : domaine et portée (organisation ou événement). Étape 2 : enregistrement CNAME à créer. */
export async function addCustomDomain(ctx: OrgContext, input: string, scope: "ORGANIZATION" | "EVENT", eventId?: string | null) {
  if (!hasFeature(ctx.features, "CUSTOM_DOMAINS")) throw new CoreError("PRO_REQUIRED");
  const domain = normalizeDomain(input);
  if (!domain) throw new CoreError("DOMAIN_INVALID");
  const base = env().NEXT_PUBLIC_BASE_DOMAIN.split(":")[0]!;
  if (domain === base || domain.endsWith(`.${base}`) || domain.endsWith("evoly.me")) throw new CoreError("DOMAIN_RESERVED");
  if ((await db.customDomain.count({ where: { organizationId: ctx.organization.id } })) >= MAX_CUSTOM_DOMAINS) throw new CoreError("DOMAIN_LIMIT");
  if (scope === "EVENT" && !(await db.event.findFirst({ where: { id: eventId ?? "", organizationId: ctx.organization.id }, select: { id: true } }))) throw new CoreError("NOT_FOUND");
  if (await db.customDomain.findUnique({ where: { domain }, select: { id: true } })) throw new CoreError("DOMAIN_TAKEN");
  const created = await db.customDomain.create({ data: { organizationId: ctx.organization.id, domain, scope, eventId: scope === "EVENT" ? eventId : null, dnsTarget: dnsTarget(), verificationToken: secretToken(12) } });
  await audit({ action: "domain.added", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "CustomDomain", targetId: created.id, metadata: { domain } });
  return created;
}

export async function removeCustomDomain(ctx: OrgContext, id: string) {
  const d = await db.customDomain.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!d) throw new CoreError("NOT_FOUND");
  await db.customDomain.delete({ where: { id: d.id } });
  await audit({ action: "domain.removed", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "CustomDomain", targetId: d.id, metadata: { domain: d.domain } });
}

/**
 * Étapes 3 et 4 : vérification du CNAME. Réussite → ACTIVE, certificat à la demande par le proxy d'entrée,
 * domaine déclaré à Stripe. Échec : erreur enregistrée ; au-delà de 48 heures, vérifications arrêtées et propriétaire prévenu.
 */
export async function verifyCustomDomain(id: string, resolver: CnameResolver = dns, now = new Date()) {
  const d = await db.customDomain.findUniqueOrThrow({ where: { id } });
  let records: string[] = [];
  let error: string | null = null;
  try {
    records = (await resolver.resolveCname(d.domain)).map((r) => r.toLowerCase().replace(/\.$/, ""));
    if (!records.includes(d.dnsTarget.toLowerCase())) error = `WRONG_TARGET:${records.join(",") || "-"}`;
  } catch (err) {
    error = (err as { code?: string }).code === "ENODATA" || (err as { code?: string }).code === "ENOTFOUND" ? "DNS_NOT_FOUND" : "DNS_ERROR";
  }
  if (!error) {
    const updated = await db.customDomain.update({ where: { id: d.id }, data: { status: "ACTIVE", verifiedAt: d.verifiedAt ?? now, lastCheckedAt: now, lastError: null, checksStoppedAt: null } });
    await ensurePaymentDomains(d.organizationId).catch(() => undefined); // RG-DOM-04
    if (d.status !== "ACTIVE") await notify(d.organizationId, "DOMAIN_ACTIVE", { title: d.domain, body: "Domaine actif : votre billetterie est en ligne à cette adresse.", link: "/brand" });
    return updated;
  }
  const expired = now.getTime() - d.createdAt.getTime() > CHECK_WINDOW_MS;
  const updated = await db.customDomain.update({ where: { id: d.id }, data: { lastCheckedAt: now, lastError: error, ...(expired && d.status === "PENDING_DNS" ? { status: "ERROR", checksStoppedAt: now } : {}) } });
  if (expired && d.status === "PENDING_DNS") {
    await notifyStopped(d.organizationId, d.domain).catch(() => undefined);
    await notify(d.organizationId, "DOMAIN_ERROR", { title: d.domain, body: "Enregistrement DNS introuvable après 48 heures : vérifiez la configuration.", link: "/brand" });
  }
  return updated;
}

/** Tâche planifiée (toutes les 10 minutes) : vérification des domaines en attente pendant 48 heures. */
export async function verifyPendingDomains(resolver: CnameResolver = dns, now = new Date()): Promise<number> {
  const pending = await db.customDomain.findMany({ where: { status: "PENDING_DNS", checksStoppedAt: null }, select: { id: true } });
  for (const p of pending) await verifyCustomDomain(p.id, resolver, now).catch(() => undefined);
  return pending.length;
}

async function notifyStopped(organizationId: string, domain: string) {
  const owner = await db.organizationMember.findFirst({ where: { organizationId, role: { systemKey: "OWNER" } }, include: { user: { select: { email: true, name: true } }, organization: { select: { slug: true, locale: true } } } });
  if (!owner) return;
  const fr = owner.organization.locale !== "en";
  const url = `${env().NEXT_PUBLIC_APP_URL}/o/${owner.organization.slug}/brand`;
  await sendEmail({
    to: owner.user.email,
    template: "domain.checks_stopped",
    category: "SERVICE",
    organizationId,
    subject: fr ? `Domaine ${domain} : configuration à vérifier` : `Domain ${domain}: check the configuration`,
    text: fr ? `Bonjour ${owner.user.name},\n\nNous n’avons pas trouvé l’enregistrement DNS attendu pour ${domain} pendant 48 heures. Vérifiez le CNAME chez votre registraire, puis cliquez sur « Vérifier maintenant » : ${url}\n\nEvoly` : `Hi ${owner.user.name},\n\nWe couldn't find the expected DNS record for ${domain} for 48 hours. Check the CNAME with your registrar, then click “Check now”: ${url}\n\nEvoly`,
    html: `<p>${fr ? `Nous n’avons pas trouvé l’enregistrement DNS attendu pour <strong>${domain}</strong> pendant 48 heures.` : `We couldn't find the expected DNS record for <strong>${domain}</strong> for 48 hours.`}</p><p><a href="${url}">${fr ? "Vérifier la configuration" : "Check the configuration"}</a></p>`,
  });
}

export async function listCustomDomains(ctx: OrgContext) {
  return db.customDomain.findMany({ where: { organizationId: ctx.organization.id }, include: { event: { select: { title: true } } }, orderBy: { createdAt: "asc" } });
}

/**
 * RG-DOM-03 : le proxy d'entrée demande un certificat seulement pour les hôtes connus et actifs
 * (sous-domaines d'organisation et d'événement, domaines personnalisés actifs d'une organisation Pro).
 */
export async function isHostAllowed(host: string): Promise<boolean> {
  const h = host.toLowerCase().replace(/\.$/, "");
  const base = env().NEXT_PUBLIC_BASE_DOMAIN.split(":")[0]!;
  if (h === base || ["app", "www", "scanner"].some((s) => h === `${s}.${base}`)) return true;
  if (h.endsWith(`.${base}`)) {
    const sub = h.slice(0, -(base.length + 1));
    if (sub.includes(".")) return false;
    const [org, event, redirect] = await Promise.all([
      db.organization.findFirst({ where: { subdomain: sub, status: "ACTIVE", deletedAt: null }, select: { id: true } }),
      db.event.findFirst({ where: { subdomain: sub, deletedAt: null }, select: { id: true } }),
      db.hostRedirect.findFirst({ where: { host: h, expiresAt: { gt: new Date() } }, select: { id: true } }),
    ]);
    return !!(org || event || redirect);
  }
  const d = await db.customDomain.findUnique({ where: { domain: h }, select: { status: true } });
  return d?.status === "ACTIVE";
}

/**
 * RG-CDM-02 : vérification quotidienne des certificats des domaines personnalisés actifs. Certificat refusé ou sur le
 * point d'expirer (renouvellement en échec) : l'organisateur est prévenu dans l'app et par e-mail, une fois par jour au plus.
 */
export async function checkCertificates(now = new Date(), resolve: (domain: string) => { host: string; port: number } = (d) => ({ host: d, port: 443 })) {
  const { certificateProblem } = await import("@evoly/core");
  const { notify } = await import("./notifications");
  const tls = await import("node:tls");
  const domains = await db.customDomain.findMany({ where: { status: "ACTIVE" }, select: { id: true, domain: true, organizationId: true } });
  let alerts = 0;
  for (const d of domains) {
    const target = resolve(d.domain);
    const info = await new Promise<{ authorized: boolean; validTo: Date | null }>((done) => {
      const socket = tls.connect({ host: target.host, port: target.port, servername: d.domain, rejectUnauthorized: false, timeout: 10_000 }, () => {
        const cert = socket.getPeerCertificate();
        done({ authorized: socket.authorized, validTo: cert?.valid_to ? new Date(cert.valid_to) : null });
        socket.end();
      });
      socket.on("error", () => done({ authorized: false, validTo: null }));
      socket.on("timeout", () => { socket.destroy(); done({ authorized: false, validTo: null }); });
    });
    const problem = certificateProblem(info, now);
    if (!problem) continue;
    const link = `/brand?certificat=${encodeURIComponent(d.domain)}`;
    const recent = await db.notification.findFirst({ where: { organizationId: d.organizationId, type: "DOMAIN_ERROR", link, createdAt: { gte: new Date(now.getTime() - 86_400_000) } }, select: { id: true } });
    if (recent) continue;
    const body = problem === "INVALID" ? "Le certificat HTTPS de ce domaine est invalide : les visiteurs voient une alerte de sécurité. Vérifiez que l'enregistrement DNS pointe toujours vers Evoly." : "Le certificat HTTPS de ce domaine n'a pas pu être renouvelé et expire bientôt. Vérifiez que l'enregistrement DNS pointe toujours vers Evoly.";
    await notify(d.organizationId, "DOMAIN_ERROR", { title: d.domain, body, link });
    const owner = await db.organizationMember.findFirst({ where: { organizationId: d.organizationId, role: { systemKey: "OWNER" } }, include: { user: { select: { email: true } } } });
    if (owner) await sendEmail({ to: owner.user.email, template: "domain.certificate", category: "SERVICE", organizationId: d.organizationId, subject: `Certificat HTTPS à vérifier : ${d.domain}`, text: `${body}\n\nEvoly`, html: `<p>${body}</p><p>Evoly</p>` }).catch(() => undefined);
    alerts += 1;
  }
  return { checked: domains.length, alerts };
}
