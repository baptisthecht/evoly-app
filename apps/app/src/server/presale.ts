import "server-only";
import { cookies } from "next/headers";
import { CoreError, PRESALE_ALPHABET, humanCode, isValidCustomPresaleCode, normalizePresaleCode, zonedLocalToUtc } from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import type { OrgContext } from "./context";

const cookieName = (eventId: string) => `evoly_presale_${eventId}`;
const MAX_CODES_PER_EVENT = 20_000;

/** RG-PRV-02 : un code est valable s'il est actif, si la prévente a commencé et s'il lui reste des utilisations, réservations en cours comprises. */
export async function presaleCodeFor(
  client: Prisma.TransactionClient | typeof db,
  event: { id: string; presaleStartsAt: Date | null },
  input: string,
  now = new Date(),
) {
  if (event.presaleStartsAt && event.presaleStartsAt > now) throw new CoreError("PRESALE_INVALID");
  const code = normalizePresaleCode(input);
  if (!code || code.length > 40) throw new CoreError("PRESALE_INVALID");
  const row = await client.presaleCode.findUnique({ where: { eventId_code: { eventId: event.id, code } } });
  if (!row || row.disabledAt) throw new CoreError("PRESALE_INVALID");
  const pending = await client.order.count({ where: { presaleCodeId: row.id, status: "PENDING", holdExpiresAt: { gt: now } } });
  if (row.usedCount + pending >= row.maxUses) throw new CoreError("PRESALE_EXHAUSTED");
  return row;
}

export async function presaleUsable(event: { id: string; presaleStartsAt: Date | null }, input: string, now = new Date()) {
  try {
    await presaleCodeFor(db, event, input, now);
    return true;
  } catch {
    return false;
  }
}

/** Code accepté, mémorisé pour ce visiteur et cet événement : la page et la réservation le retrouvent. */
export async function presaleCookie(eventId: string) {
  return (await cookies()).get(cookieName(eventId))?.value ?? null;
}

/** Déverrouillage par le visiteur, depuis le formulaire ou un lien « ?prevente=CODE ». */
export async function unlockPresale(eventId: string, input: string, now = new Date()) {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null, status: "PUBLISHED" }, select: { id: true, presaleStartsAt: true } });
  if (!event) throw new CoreError("PRESALE_INVALID");
  await presaleCodeFor(db, event, input, now);
  (await cookies()).set(cookieName(event.id), normalizePresaleCode(input), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 3 * 86_400,
  });
}

async function ownEvent(ctx: OrgContext, eventId: string) {
  const event = await db.event.findFirst({ where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null } });
  if (!event) throw new CoreError("NOT_FOUND");
  return event;
}

export type GenerateInput = { quantity: number; usesPerCode: number; customCode: string | null; label: string | null };

/**
 * RG-PRV-01 : N codes utilisables X fois chacun. Usage unique en masse (N codes, X = 1), code partagé (un code, X utilisations,
 * éventuellement personnalisé) ou plusieurs codes à usages multiples.
 */
export async function generatePresaleCodes(ctx: OrgContext, eventId: string, input: GenerateInput) {
  const event = await ownEvent(ctx, eventId);
  const quantity = Math.trunc(input.quantity);
  const uses = Math.trunc(input.usesPerCode);
  if (!(quantity >= 1 && quantity <= 5000 && uses >= 1 && uses <= 100_000)) throw new CoreError("INVALID_INPUT");
  if ((await db.presaleCode.count({ where: { eventId: event.id } })) + quantity > MAX_CODES_PER_EVENT) throw new CoreError("PRESALE_LIMIT");
  const label = input.label?.trim().slice(0, 60) || null;
  if (input.customCode?.trim()) {
    if (quantity !== 1) throw new CoreError("INVALID_INPUT");
    const code = normalizePresaleCode(input.customCode);
    if (!isValidCustomPresaleCode(code)) throw new CoreError("PRESALE_CODE_FORMAT");
    if (await db.presaleCode.findUnique({ where: { eventId_code: { eventId: event.id, code } } })) throw new CoreError("PRESALE_CODE_TAKEN");
    await db.presaleCode.create({ data: { eventId: event.id, code, label, maxUses: uses } });
    return 1;
  }
  let created = 0;
  for (let round = 0; round < 6 && created < quantity; round++) {
    const codes = new Set<string>();
    while (codes.size < quantity - created) codes.add(humanCode(8, PRESALE_ALPHABET));
    const r = await db.presaleCode.createMany({ data: [...codes].map((code) => ({ eventId: event.id, code, label, maxUses: uses })), skipDuplicates: true });
    created += r.count;
  }
  return created;
}

export async function setPresaleCodeActive(ctx: OrgContext, eventId: string, codeId: string, active: boolean) {
  const event = await ownEvent(ctx, eventId);
  const r = await db.presaleCode.updateMany({ where: { id: codeId, eventId: event.id }, data: { disabledAt: active ? null : new Date() } });
  if (r.count === 0) throw new CoreError("NOT_FOUND");
}

/** Début facultatif de la prévente, à l'heure du lieu ; elle s'arrête d'elle-même à l'ouverture publique. */
export async function savePresaleStart(ctx: OrgContext, eventId: string, startsLocal: string | null) {
  const event = await ownEvent(ctx, eventId);
  const at = startsLocal ? zonedLocalToUtc(startsLocal, event.timezone) : null;
  if (at && at >= event.startsAt) throw new CoreError("PRESALE_AFTER_START");
  await db.event.update({ where: { id: event.id }, data: { presaleStartsAt: at } });
}

export async function presaleOverview(eventId: string, limit = 50) {
  const [codes, totals] = await Promise.all([
    db.presaleCode.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, code: true, label: true, maxUses: true, usedCount: true, disabledAt: true },
    }),
    db.presaleCode.aggregate({ where: { eventId }, _count: { _all: true }, _sum: { usedCount: true, maxUses: true } }),
  ]);
  return {
    codes: codes.map((c) => ({ id: c.id, code: c.code, label: c.label, maxUses: c.maxUses, usedCount: c.usedCount, active: !c.disabledAt })),
    count: totals._count._all,
    used: totals._sum.usedCount ?? 0,
    capacity: totals._sum.maxUses ?? 0,
  };
}

/** Export CSV de tous les codes, avec le lien personnel de chacun. */
export async function presaleCsv(ctx: OrgContext, eventId: string, eventUrl: string) {
  const event = await ownEvent(ctx, eventId);
  const rows = await db.presaleCode.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["code", "libellé", "utilisations max", "utilisations", "état", "lien"].map(cell).join(",")];
  for (const r of rows)
    lines.push(
      [r.code, r.label ?? "", r.maxUses, r.usedCount, r.disabledAt ? "désactivé" : "actif", `${eventUrl}?prevente=${encodeURIComponent(r.code)}`]
        .map(cell)
        .join(","),
    );
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
