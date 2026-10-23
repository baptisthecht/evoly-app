import { blocksToEmailDoc } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelCampaignsForEvent,
  countAudience,
  deleteCampaign,
  previewCampaign,
  renderCampaignDraft,
  saveCampaign,
  scheduleCampaign,
  sendTestCampaign,
} from "@/server/campaigns";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
const CONTENT = blocksToEmailDoc([
  { type: "heading", text: "Bonjour {{prenom}}" },
  { type: "text", text: "Notre prochaine date arrive." },
]);

async function setup() {
  const id = rid();
  const user = await db.user.create({
    data: {
      name: "Camille Dupont",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
      addressLine1: "Rue Haute 1",
      postalCode: "1000",
      city: "Bruxelles",
    },
  });
  await db.subscription.create({
    data: {
      organizationId: org.id,
      planId: "pro",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 60 * DAY),
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `bal-${id}`,
      publicCode: `B${id}`.toUpperCase().slice(0, 8),
      title: `Bal ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Entrée",
          priceMinor: 0,
          currency: "EUR",
          quantity: 50,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
    locale: "fr",
  });
  await submitBuyer(r.token, {
    firstName: "Anna",
    lastName: "Test",
    email: `anna.${id}@exemple.be`,
    marketingOptIn: true,
  });
  const ctx = {
    organization: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      locale: "fr",
      timezone: "Europe/Brussels",
    },
    user: { id: user.id, name: user.name, email: user.email },
    features: (await getPlans()).pro.features,
  } as unknown as OrgContext;
  return { user, org, event, ctx };
}

describe("campagnes : audience, rendu, aperçu, envoi de test, programmation, suppression, annulation (US-MKT-03)", () => {
  it("audience comptée, segment invalide à zéro ; brouillon rendu avec le prénom ; aperçu et envoi de test à l'organisateur", async () => {
    const s = await setup();
    expect(await countAudience(s.ctx, { kind: "ALL_CONSENTING" })).toBe(1);
    expect(await countAudience(s.ctx, { kind: "INCONNU" })).toBe(0);
    expect(
      JSON.stringify(
        await renderCampaignDraft(s.ctx, {
          subject: "Notre prochaine date",
          content: CONTENT,
        }),
      ),
    ).toContain("Notre prochaine date arrive.");
    const c = await saveCampaign(s.ctx, {
      name: "Relance",
      subject: "Notre prochaine date",
      content: CONTENT,
      segment: { kind: "ALL_CONSENTING" },
    });
    expect(JSON.stringify(await previewCampaign(s.ctx, c.id))).toContain(
      "Camille",
    ); // prénom de l'organisateur dans l'aperçu
    const avant = await db.emailMessage.count({
      where: { toEmail: s.user.email },
    });
    expect(await sendTestCampaign(s.ctx, c.id)).toBe(s.user.email);
    expect(
      await db.emailMessage.count({ where: { toEmail: s.user.email } }),
    ).toBeGreaterThan(avant);
  });

  it("programmation trop proche refusée ; campagne programmée verrouillée ; brouillon supprimé ; événement annulé : campagne annulée et auteur prévenu", async () => {
    const s = await setup();
    const c = await saveCampaign(s.ctx, {
      name: "Rappel du bal",
      subject: "Le bal approche",
      content: CONTENT,
      segment: { kind: "EVENTS", eventIds: [s.event.id], attendance: "ANY" },
    });
    await expect(
      scheduleCampaign(s.ctx, c.id, new Date(Date.now() + 60_000)),
    ).rejects.toMatchObject({ code: "CAMPAIGN_SCHEDULE_TOO_SOON" });
    await scheduleCampaign(s.ctx, c.id, new Date(Date.now() + DAY));
    await expect(deleteCampaign(s.ctx, c.id)).rejects.toMatchObject({
      code: "CAMPAIGN_LOCKED",
    });
    const avant = await db.emailMessage.count({
      where: { toEmail: s.user.email, template: "campaign.cancelled" },
    });
    await cancelCampaignsForEvent(s.event.id);
    expect(
      (await db.emailCampaign.findUniqueOrThrow({ where: { id: c.id } }))
        .status,
    ).toBe("CANCELLED");
    expect(
      await db.emailMessage.count({
        where: { toEmail: s.user.email, template: "campaign.cancelled" },
      }),
    ).toBe(avant + 1);
    const brouillon = await saveCampaign(s.ctx, {
      name: "Brouillon",
      subject: "À supprimer",
      content: CONTENT,
      segment: { kind: "ALL_CONSENTING" },
    });
    await deleteCampaign(s.ctx, brouillon.id);
    expect(
      await db.emailCampaign.findUnique({ where: { id: brouillon.id } }),
    ).toBeNull();
  });
});
