import "server-only";
import { can, CoreError, hasFeature } from "@evoly/core";
import { toLocale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";

const MAX_ROWS = 10_000;
const MAX_CHARS = 2_000_000;
const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]{2,}$/;
const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export type ImportRow = { email: string; firstName: string; lastName: string; locale: string };

/** CSV simple : séparateur détecté (point-virgule, virgule ou tabulation), guillemets gérés, en-tête reconnu en français et en anglais. */
export function parseContactsCsv(text: string): ImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length === 0) return [];
  const first = lines[0]!;
  const sep = ([";", ",", "\t"] as const).map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]!;
      if (quoted) {
        if (ch === '"' && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const header = split(first).map(plain);
  const find = (names: string[], skip: number[] = []) => {
    const exact = header.findIndex((h, i) => !skip.includes(i) && names.includes(h));
    return exact >= 0 ? exact : header.findIndex((h, i) => !skip.includes(i) && names.some((n) => h.includes(n)));
  };
  const iEmail = find(["email", "e-mail", "courriel", "mail", "adresse e-mail"]);
  const hasHeader = iEmail >= 0;
  const e = hasHeader ? iEmail : 0;
  const f = hasHeader ? find(["prenom", "first name", "firstname", "first"], [e]) : 1;
  const l = hasHeader ? find(["nom", "nom de famille", "last name", "lastname", "last", "name"], [e, f]) : 2;
  const lang = hasHeader ? find(["langue", "language", "locale", "lang"], [e, f, l]) : -1;
  return (hasHeader ? lines.slice(1) : lines).map((line) => {
    const c = split(line);
    return {
      email: (c[e] ?? "").toLowerCase(),
      firstName: f >= 0 ? (c[f] ?? "") : "",
      lastName: l >= 0 ? (c[l] ?? "") : "",
      locale: lang >= 0 ? (c[lang] ?? "") : "",
    };
  });
}

/**
 * Import de contacts (P1), pour les e-mails marketing : l'organisateur certifie le consentement des contacts ;
 * un contact désinscrit n'est jamais réabonné par un import (RGPD) ; doublons et adresses invalides ignorés.
 */
export async function importContacts(ctx: OrgContext, text: string, consentConfirmed: boolean, now = new Date()) {
  if (!hasFeature(ctx.features, "EMAIL_MARKETING")) throw new CoreError("PRO_REQUIRED");
  if (!can(ctx.membership, "MARKETING_MANAGE")) throw new CoreError("FORBIDDEN");
  if (!consentConfirmed) throw new CoreError("IMPORT_CONSENT_REQUIRED");
  if (text.length > MAX_CHARS) throw new CoreError("IMPORT_TOO_LARGE");
  const rows = parseContactsCsv(text);
  if (rows.length > MAX_ROWS) throw new CoreError("IMPORT_TOO_LARGE");
  const organizationId = ctx.organization.id;
  const seen = new Set<string>();
  const valid: ImportRow[] = [];
  let invalid = 0;
  for (const r of rows) {
    if (!EMAIL.test(r.email) || r.email.length > 200) {
      invalid++;
      continue;
    }
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    valid.push(r);
  }
  const existing = await db.contact.findMany({
    where: { organizationId, email: { in: valid.map((r) => r.email) } },
    select: { id: true, email: true, unsubscribedAt: true, marketingConsent: true },
  });
  const byEmail = new Map(existing.map((c) => [c.email, c]));
  const names = (r: ImportRow) => ({
    ...(r.firstName ? { firstName: r.firstName.slice(0, 100) } : {}),
    ...(r.lastName ? { lastName: r.lastName.slice(0, 100) } : {}),
  });
  const fresh = valid.filter((r) => !byEmail.has(r.email));
  if (fresh.length)
    await db.contact.createMany({
      data: fresh.map((r) => ({
        organizationId,
        email: r.email,
        ...names(r),
        locale: r.locale ? toLocale(r.locale) : ctx.organization.locale,
        marketingConsent: true,
        consentAt: now,
        consentSource: "IMPORT" as const,
      })),
      skipDuplicates: true,
    });
  let updated = 0;
  let unsubscribed = 0;
  for (const r of valid) {
    const c = byEmail.get(r.email);
    if (!c) continue;
    if (c.unsubscribedAt) {
      unsubscribed++;
      continue;
    }
    await db.contact.update({
      where: { id: c.id },
      data: { ...names(r), ...(c.marketingConsent ? {} : { marketingConsent: true, consentAt: now, consentSource: "IMPORT" as const }) },
    });
    updated++;
  }
  const result = { created: fresh.length, updated, unsubscribed, invalid };
  await audit({ action: "contacts.import", organizationId, actorUserId: ctx.user.id, targetType: "Organization", targetId: organizationId, metadata: result });
  return result;
}
