import "server-only";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import type { OrgContext } from "./context";

export type ContactFilter = "ALL" | "CONSENTING" | "UNSUBSCRIBED";

/** US-MKT-04 : contacts de l'organisation, avec consentement, désinscription et historique d'achat. */
export async function searchContacts(ctx: OrgContext, opts: { q?: string; filter?: ContactFilter; page?: number }) {
  const q = opts.q?.trim();
  const where: Prisma.ContactWhereInput = {
    organizationId: ctx.organization.id,
    ...(opts.filter === "CONSENTING" ? { marketingConsent: true, unsubscribedAt: null } : {}),
    ...(opts.filter === "UNSUBSCRIBED" ? { unsubscribedAt: { not: null } } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const page = Math.max(0, opts.page ?? 0);
  const [rows, total, stats] = await Promise.all([
    db.contact.findMany({ where, orderBy: [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 50, skip: page * 50 }),
    db.contact.count({ where }),
    Promise.all([
      db.contact.count({ where: { organizationId: ctx.organization.id } }),
      db.contact.count({ where: { organizationId: ctx.organization.id, marketingConsent: true, unsubscribedAt: null } }),
      db.contact.count({ where: { organizationId: ctx.organization.id, unsubscribedAt: { not: null } } }),
    ]),
  ]);
  return { rows, total, pages: Math.ceil(total / 50), stats: { all: stats[0], consenting: stats[1], unsubscribed: stats[2] } };
}

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export des contacts (permission CONTACTS_EXPORT) : consentement, date et source compris (RG-RGPD-01). */
export async function contactsCsv(ctx: OrgContext): Promise<string> {
  const rows = await db.contact.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "asc" } });
  const head = [
    "E-mail",
    "Prénom",
    "Nom",
    "Langue",
    "Consentement marketing",
    "Date du consentement",
    "Source",
    "Désinscrit le",
    "Commandes",
    "Billets",
    "Montant dépensé",
    "Dernière commande",
  ];
  const lines = rows.map((c) => [
    c.email,
    c.firstName,
    c.lastName,
    c.locale,
    c.marketingConsent && !c.unsubscribedAt ? "oui" : "non",
    c.consentAt?.toISOString().slice(0, 10),
    c.consentSource,
    c.unsubscribedAt?.toISOString().slice(0, 10),
    c.ordersCount,
    c.ticketsCount,
    (c.totalSpentMinor / 100).toFixed(2).replace(".", ","),
    c.lastOrderAt?.toISOString().slice(0, 10),
  ]);
  return "\ufeff" + [head, ...lines].map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
}
