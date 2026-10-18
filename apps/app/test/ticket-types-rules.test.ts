import { beforeEach, describe, expect, it, vi } from "vitest";

const resale = vi.hoisted(() => ({ cancelListingsForTicketType: vi.fn(async () => 0) }));
vi.mock("@/server/resale", () => resale);
const { db } = await import("@/lib/db");
const { findOrgContext } = await import("@/server/context");
const { deleteTicketType, updateTicketType } = await import("@/server/tickets");
type Ctx = Parameters<typeof updateTicketType>[0];

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(resaleAllowed: boolean) {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const owner = await db.role.findUniqueOrThrow({ where: { systemKey: "OWNER" } });
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      subscription: { create: { planId: "pro", status: "ACTIVE", currency: "EUR", stripeSubscriptionId: `sub_${id}` } },
      members: { create: { userId: user.id, roleId: owner.id } },
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 10 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Fosse", priceMinor: 0, currency: "EUR", quantity: 50, resaleAllowed } },
    },
    include: { ticketTypes: true },
  });
  const ctx = { ...(await findOrgContext(user.id, org.slug))!, user: { id: user.id, name: user.name, email: user.email } } as Ctx;
  return { ctx, event, type: event.ticketTypes[0]! };
}
const input = (resaleAllowed: boolean) => ({
  name: "Fosse",
  price: "0",
  quantity: 50,
  minPerOrder: 1,
  maxPerOrder: 10,
  visibility: "VISIBLE" as const,
  isNominative: false,
  resaleAllowed,
});
beforeEach(() => resale.cancelListingsForTicketType.mockClear());

describe("règles des tarifs", () => {
  it("revente désactivée sur un tarif : ses annonces en cours sont annulées (RG-RSL-09)", async () => {
    const s = await setup(true);
    await updateTicketType(s.ctx, s.event.id, s.type.id, input(false));
    expect(resale.cancelListingsForTicketType).toHaveBeenCalledWith(s.type.id);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.type.id } })).resaleAllowed).toBe(false);
  });

  it("revente laissée activée, ou déjà désactivée : aucune annonce touchée", async () => {
    const on = await setup(true);
    await updateTicketType(on.ctx, on.event.id, on.type.id, input(true));
    const off = await setup(false);
    await updateTicketType(off.ctx, off.event.id, off.type.id, input(false));
    expect(resale.cancelListingsForTicketType).not.toHaveBeenCalled();
  });

  it("un tarif qui a des ventes ne se supprime pas ; sans vente, il se supprime (RG-TKT-06)", async () => {
    const s = await setup(false);
    await db.ticketType.update({ where: { id: s.type.id }, data: { quantitySold: 1 } });
    await expect(deleteTicketType(s.ctx, s.event.id, s.type.id)).rejects.toMatchObject({ code: "TICKET_TYPE_HAS_SALES" });
    await db.ticketType.update({ where: { id: s.type.id }, data: { quantitySold: 0 } });
    await deleteTicketType(s.ctx, s.event.id, s.type.id);
    expect(await db.ticketType.findUnique({ where: { id: s.type.id } })).toBeNull();
  });
});
