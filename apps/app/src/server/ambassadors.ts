import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { CoreError, hasFeature, personKey } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent } from "./events";
import { eventPublicUrl } from "./urls";
import { createPromo } from "./promos";

/**
 * Ambassadeurs (section 9.28, Pro) : chaque membre de l'équipe ou promoteur a son lien de vente (?a=CODE) ; la commande est attribuée
 * au dernier lien suivi (RG-AMB-02) ; le classement compte les billets valides, remboursements et annulations exclus (RG-AMB-03).
 */
export type AmbassadorFormInput = { name: string; email?: string; goal?: string; reward?: string };
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function parse(input: AmbassadorFormInput) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new CoreError("AMBASSADOR_NAME_REQUIRED");
  const email = input.email?.trim().toLowerCase().slice(0, 200) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CoreError("AMBASSADOR_EMAIL_INVALID");
  const goal = input.goal?.trim() ? Number(input.goal) : null;
  if (goal != null && (!Number.isInteger(goal) || goal < 1 || goal > 100_000)) throw new CoreError("AMBASSADOR_GOAL_INVALID");
  return { name, email, goal, reward: input.reward?.trim().slice(0, 200) || null };
}

/** Code lisible tiré du nom : « Marie Dupont » → marie-k7q2. */
function makeCode(name: string) {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)[0]
      ?.slice(0, 12) || "amb";
  return `${base}-${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
}

export async function createAmbassador(ctx: OrgContext, eventId: string, input: AmbassadorFormInput) {
  if (!hasFeature(ctx.features, "AMBASSADORS")) throw new CoreError("FEATURE_UNAVAILABLE");
  await findEvent(ctx, eventId);
  const data = parse(input);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const a = await db.ambassador.create({ data: { eventId, ...data, code: makeCode(data.name), statsToken: randomBytes(18).toString("base64url") } });
      await audit({ action: "ambassador.created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Ambassador", targetId: a.id });
      return a;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  throw new Error("code d'ambassadeur introuvable");
}

export async function updateAmbassador(ctx: OrgContext, eventId: string, id: string, input: AmbassadorFormInput) {
  if (!hasFeature(ctx.features, "AMBASSADORS")) throw new CoreError("FEATURE_UNAVAILABLE");
  await findEvent(ctx, eventId);
  const res = await db.ambassador.updateMany({ where: { id, eventId }, data: parse(input) });
  if (res.count === 0) throw new CoreError("NOT_FOUND");
}

/** Un ambassadeur désactivé garde ses ventes au classement, mais son lien n'attribue plus rien. */
export async function setAmbassadorActive(ctx: OrgContext, eventId: string, id: string, active: boolean) {
  await findEvent(ctx, eventId);
  const res = await db.ambassador.updateMany({ where: { id, eventId }, data: { active } });
  if (res.count === 0) throw new CoreError("NOT_FOUND");
  await db.promoCode.updateMany({ where: { ambassadorId: id }, data: { isActive: active } }); // sa réduction suit son état (RG-AMB-01)
}

/**
 * Code promo d'un ambassadeur (RG-AMB-01) : son code devient aussi un code promo, avec la réduction choisie par l'organisateur.
 * Créé par createPromo, donc soumis à toutes les règles des codes promo ; l'acheteur qui le saisit obtient la réduction et la vente
 * est attribuée à l'ambassadeur, même sans son lien (checkout).
 */
export async function setAmbassadorPromo(
  ctx: OrgContext,
  eventId: string,
  id: string,
  input: { discountType: "PERCENT"; percent: string } | { discountType: "AMOUNT"; amount: string },
) {
  if (!hasFeature(ctx.features, "AMBASSADORS")) throw new CoreError("FEATURE_UNAVAILABLE");
  await findEvent(ctx, eventId);
  const a = await db.ambassador.findFirst({ where: { id, eventId }, select: { id: true, code: true, active: true, promoCode: { select: { id: true } } } });
  if (!a) throw new CoreError("NOT_FOUND");
  if (a.promoCode) throw new CoreError("AMBASSADOR_PROMO_EXISTS");
  const promo = await createPromo(ctx, eventId, {
    code: a.code,
    discountType: input.discountType,
    percent: input.discountType === "PERCENT" ? input.percent : null,
    amount: input.discountType === "AMOUNT" ? input.amount : null,
    ticketTypeIds: [], // tous les tarifs
    unlocksHidden: false, // une remise, jamais l'accès aux tarifs réservés
  });
  return db.promoCode.update({ where: { id: promo.id }, data: { ambassadorId: a.id, isActive: a.active } });
}

/** Retirer la réduction : jamais utilisée, elle est supprimée ; déjà utilisée, elle reste dans les codes promo, désactivée et détachée. */
export async function removeAmbassadorPromo(ctx: OrgContext, eventId: string, id: string) {
  await findEvent(ctx, eventId);
  const promo = await db.promoCode.findFirst({ where: { ambassadorId: id, eventId } });
  if (!promo) throw new CoreError("NOT_FOUND");
  if (promo.usedCount > 0) await db.promoCode.update({ where: { id: promo.id }, data: { isActive: false, ambassadorId: null } });
  else await db.promoCode.delete({ where: { id: promo.id } });
}

/** Pendant la réservation : l'ambassadeur du lien, s'il existe et est actif ; un code inconnu est ignoré, l'achat n'échoue jamais. */
export async function resolveAmbassadorInTx(tx: Prisma.TransactionClient, eventId: string, code: string) {
  const a = await tx.ambassador.findUnique({
    where: { eventId_code: { eventId, code: code.trim().toLowerCase().slice(0, 40) } },
    select: { id: true, active: true },
  });
  return a?.active ? a.id : null;
}

/** Classement d'un événement : billets valides (ou revendus après la vente) et montant, du premier au dernier (RG-AMB-05). */
export async function ambassadorRanking(eventId: string) {
  const ambassadors = await db.ambassador.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
  const tickets = await db.ticket.findMany({
    where: {
      eventId,
      order: { ambassadorId: { not: null } },
      OR: [{ status: { in: ["VALID", "CHECKED_IN"] } }, { status: "VOID", voidReason: "RESOLD" }],
    },
    select: { faceValueMinor: true, order: { select: { ambassadorId: true } } },
  });
  const sums = new Map<string, { tickets: number; amountMinor: number }>();
  for (const t of tickets) {
    const k = t.order.ambassadorId!;
    const cur = sums.get(k) ?? { tickets: 0, amountMinor: 0 };
    sums.set(k, { tickets: cur.tickets + 1, amountMinor: cur.amountMinor + t.faceValueMinor });
  }
  return ambassadors
    .map((a) => ({ ...a, ...(sums.get(a.id) ?? { tickets: 0, amountMinor: 0 }) }))
    .sort((x, y) => y.tickets - x.tickets || y.amountMinor - x.amountMinor || x.createdAt.getTime() - y.createdAt.getTime());
}

/**
 * Classement sur toute l'organisation (RG-AMB-05) : mêmes billets que le classement par événement, une ligne par personne
 * (même e-mail, ou même nom sans e-mail), tous événements confondus ; les ambassadeurs anonymisés n'y figurent plus.
 */
export async function organizationAmbassadorRanking(ctx: OrgContext) {
  if (!hasFeature(ctx.features, "AMBASSADORS")) throw new CoreError("FEATURE_UNAVAILABLE");
  const ambassadors = await db.ambassador.findMany({
    where: { event: { organizationId: ctx.organization.id }, NOT: { statsToken: { startsWith: "anonyme-" } } },
    select: { id: true, name: true, email: true, eventId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const tickets = ambassadors.length
    ? await db.ticket.findMany({
        where: {
          order: { ambassadorId: { in: ambassadors.map((a) => a.id) } },
          OR: [{ status: { in: ["VALID", "CHECKED_IN"] } }, { status: "VOID", voidReason: "RESOLD" }],
        },
        select: { faceValueMinor: true, order: { select: { ambassadorId: true } } },
      })
    : [];
  const sums = new Map<string, { tickets: number; amountMinor: number }>();
  for (const t of tickets) {
    const cur = sums.get(t.order.ambassadorId!) ?? { tickets: 0, amountMinor: 0 };
    sums.set(t.order.ambassadorId!, { tickets: cur.tickets + 1, amountMinor: cur.amountMinor + t.faceValueMinor });
  }
  const people = new Map<string, { key: string; name: string; events: Set<string>; tickets: number; amountMinor: number; since: Date }>();
  for (const a of ambassadors) {
    const key = personKey(a.name, a.email);
    const p = people.get(key) ?? { key, name: a.name, events: new Set<string>(), tickets: 0, amountMinor: 0, since: a.createdAt };
    p.name = a.name; // le nom le plus récent
    p.events.add(a.eventId);
    const sum = sums.get(a.id);
    if (sum) {
      p.tickets += sum.tickets;
      p.amountMinor += sum.amountMinor;
    }
    people.set(key, p);
  }
  return [...people.values()]
    .map((p) => ({ key: p.key, name: p.name, events: p.events.size, tickets: p.tickets, amountMinor: p.amountMinor, since: p.since }))
    .sort((x, y) => y.tickets - x.tickets || y.amountMinor - x.amountMinor || x.since.getTime() - y.since.getTime());
}

const statsUrl = (token: string) => `${env().NEXT_PUBLIC_APP_URL}/ambassadeur/${token}`;

/** Pour l'organisateur : classement, lien de vente et lien privé de chaque ambassadeur. */
export async function listAmbassadors(ctx: OrgContext, eventId: string) {
  const event = await findEvent(ctx, eventId);
  const url = eventPublicUrl({ subdomain: ctx.organization.subdomain ?? null, slug: ctx.organization.slug }, event);
  const ranking = await ambassadorRanking(eventId);
  const promos = await db.promoCode.findMany({
    where: { ambassadorId: { in: ranking.map((a) => a.id) } },
    select: { ambassadorId: true, code: true, percentOffBps: true, amountOffMinor: true, isActive: true, usedCount: true },
  });
  return ranking.map((a) => ({
    ...a,
    saleUrl: `${url}?a=${a.code}`,
    statsUrl: statsUrl(a.statsToken),
    promo: promos.find((p) => p.ambassadorId === a.id) ?? null,
  }));
}

/** Lien privé de l'ambassadeur : ses ventes, son rang et le classement, jamais les données des acheteurs (RG-AMB-04). */
export async function ambassadorStats(token: string) {
  const me = await db.ambassador.findUnique({
    where: { statsToken: token.slice(0, 60) },
    select: { id: true, eventId: true, event: { select: { title: true, currency: true } } },
  });
  if (!me) return null;
  const ranking = await ambassadorRanking(me.eventId);
  const mine = ranking.find((r) => r.id === me.id)!;
  return {
    event: me.event,
    name: mine.name,
    tickets: mine.tickets,
    amountMinor: mine.amountMinor,
    goal: mine.goal,
    reward: mine.reward,
    rank: ranking.findIndex((r) => r.id === me.id) + 1,
    total: ranking.length,
    leaderboard: ranking.slice(0, 20).map((r) => ({ name: r.name, tickets: r.tickets, me: r.id === me.id })),
  };
}

/** Export du classement (CSV, séparateur point-virgule, lisible par Excel). */
export async function ambassadorsCsv(ctx: OrgContext, eventId: string) {
  const rows = await listAmbassadors(ctx, eventId);
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Rang", "Nom", "E-mail", "Code", "Billets", "Montant", "Objectif", "Lien de vente"].map(cell).join(";")];
  rows.forEach((r, i) => lines.push([i + 1, r.name, r.email, r.code, r.tickets, (r.amountMinor / 100).toFixed(2), r.goal, r.saleUrl].map(cell).join(";")));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
