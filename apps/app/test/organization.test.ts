import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { subdomainAvailable } from "@/server/brand";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext, type OrgContext } from "@/server/context";
import { deleteOrganization, deletionBlockers, normalizeVatNumber, updateOrganizationSettings } from "@/server/organization";
import { resolveSite } from "@/server/publicEvents";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(opts: { withTickets?: boolean; subscription?: "active" | "canceling" } = {}) {
  const id = rid();
  const [owner, admin] = await Promise.all(["own", "adm"].map((p) => db.user.create({ data: { name: `${p} ${id}`, email: `${p}.${id}@exemple.be`, emailVerified: true } })));
  const org = await db.organization.create({ data: { name: `Asso ${id}`, slug: `asso-${id}`, subdomain: `asso-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  await db.organizationMember.createMany({ data: [{ organizationId: org.id, userId: owner!.id, roleId: (await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } })).id }, { organizationId: org.id, userId: admin!.id, roleId: (await db.role.findFirstOrThrow({ where: { systemKey: "ADMIN" } })).id }] });
  if (opts.subscription) await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", stripeSubscriptionId: `sub_${id}`, cancelAtPeriodEnd: opts.subscription === "canceling", currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) } });
  let orderId: string | null = null;
  if (opts.withTickets) {
    const event = await db.event.create({ data: { organizationId: org.id, slug: `fete-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Fête ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 4 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50 } } }, include: { ticketTypes: true } });
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: true });
    orderId = r.orderId;
  }
  const ctxOf = async (userId: string) => ({ ...(await findOrgContext(userId, org.slug))!, user: { id: userId } }) as unknown as OrgContext;
  return { id, org, owner: owner!, admin: admin!, ctxOf, orderId };
}
const base = (id: string) => ({ name: `Asso ${id}`, type: "ASSOCIATION" as const, country: "BE", currency: "EUR", locale: "fr" as const, timezone: "Europe/Brussels", vatRegistered: true });

describe("paramètres et suppression de l'organisation (section 9.3)", () => {
  it("paramètres : TVA normalisée, site complété, devise bloquée après la première vente", async () => {
    expect(normalizeVatNumber("0123.456.789", "BE")).toBe("BE0123456789");
    expect(() => normalizeVatNumber("BE-12", "BE")).toThrow("VAT_NUMBER_INVALID");
    const s = await setup({ withTickets: true });
    const ctx = await s.ctxOf(s.owner.id);
    const org = await updateOrganizationSettings(ctx, { ...base(s.id), legalName: "Asso Lumière ASBL", website: "asso.be", vatNumber: "be 0123 456 789" });
    expect(org).toMatchObject({ legalName: "Asso Lumière ASBL", website: "https://asso.be", vatNumber: "BE0123456789" });
    await expect(updateOrganizationSettings(ctx, { ...base(s.id), currency: "USD" })).rejects.toThrow("CURRENCY_LOCKED");
    await expect(updateOrganizationSettings(ctx, { ...base(s.id), country: "US" })).rejects.toThrow("COUNTRY_NOT_SUPPORTED");
  });

  it("suppression bloquée par des participants à venir ou un abonnement qui se renouvelle", async () => {
    expect(await deletionBlockers((await setup({ withTickets: true })).org.id)).toEqual(["UPCOMING_SALES"]);
    expect(await deletionBlockers((await setup({ subscription: "active" })).org.id)).toEqual(["ACTIVE_SUBSCRIPTION"]);
    expect(await deletionBlockers((await setup({ subscription: "canceling" })).org.id)).toEqual([]);
  });

  it("suppression : propriétaire seul, double confirmation, commandes anonymisées, reste effacé, adresse libérée", async () => {
    const s = await setup({ withTickets: true });
    await db.event.updateMany({ where: { organizationId: s.org.id }, data: { status: "CANCELLED" } });
    await db.ticket.updateMany({ where: { orderId: s.orderId! }, data: { status: "VOID", voidReason: "EVENT_CANCELLED" } });
    await expect(deleteOrganization(await s.ctxOf(s.admin.id), s.org.name)).rejects.toThrow("OWNER_ONLY");
    await expect(deleteOrganization(await s.ctxOf(s.owner.id), "autre nom")).rejects.toThrow("DELETE_CONFIRMATION_MISMATCH");
    await deleteOrganization(await s.ctxOf(s.owner.id), s.org.name);
    const org = await db.organization.findUniqueOrThrow({ where: { id: s.org.id } });
    expect(org).toMatchObject({ status: "DELETED", subdomain: null, name: "Organisation supprimée" });
    const order = await db.order.findUniqueOrThrow({ where: { id: s.orderId! } });
    expect(order).toMatchObject({ buyerFirstName: "Anonyme", buyerEmail: `anonyme+${s.orderId}@evoly.invalid`, status: "PAID" });
    expect(await db.contact.count({ where: { organizationId: s.org.id } })).toBe(0);
    expect(await db.organizationMember.count({ where: { organizationId: s.org.id } })).toBe(0);
    expect(await findOrgContext(s.owner.id, s.org.slug)).toBeNull();
    expect(await resolveSite(`asso-${s.id}`)).toBeNull();
    expect(await subdomainAvailable(`asso-${s.id}`)).toMatchObject({ ok: true });
  });
});
