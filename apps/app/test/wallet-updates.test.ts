import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import {
  applePassToken,
  passJson,
  type AppleCredentials,
} from "@/server/wallet/apple";
import type { GoogleCredentials } from "@/server/wallet/google";
import {
  passAuthorized,
  registerDevice,
  unregisterDevice,
  updatedSerials,
} from "@/server/wallet/service";
import { syncWalletPasses } from "@/server/wallet/sync";
import { walletFingerprint, walletTicketById } from "@/server/wallet/ticket";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
// identifiants simulés : Apple et Google ne sont jamais appelés pour de vrai
const APPLE = {
  passTypeIdentifier: "pass.be.evoly.test",
  teamIdentifier: "TEAM123456",
  certPem: "",
  keyPem: "",
  wwdrPem: "",
} as unknown as AppleCredentials;
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const GOOGLE = {
  issuerId: "3388000000000000000",
  serviceAccountEmail: "wallet@evoly.iam.gserviceaccount.com",
  privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
} as unknown as GoogleCredentials;

/** Un billet payé, par le vrai parcours d'achat. */
async function billet() {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Entrée",
          priceMinor: 1000,
          currency: "EUR",
          quantity: 100,
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
  await db.order.update({
    where: { id: r.orderId },
    data: {
      buyerEmail: `a.${id}@exemple.be`,
      buyerFirstName: "Alex",
      buyerLastName: "Martin",
    },
  });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  return {
    event,
    ticket: await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } }),
  };
}

describe("cartes Wallet tenues à jour (RG-POST-04)", () => {
  it("empreinte : change avec l'événement ou un billet désactivé, pas avec un passage à l'entrée ; pass Apple avec son service de mise à jour, annulé si le billet est désactivé", async () => {
    const { event, ticket } = await billet();
    const t0 = (await walletTicketById(ticket.id))!;
    expect(t0.valid).toBe(true);
    await db.ticket.update({
      where: { id: ticket.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });
    expect(walletFingerprint((await walletTicketById(ticket.id))!)).toBe(
      walletFingerprint(t0),
    ); // un passage à l'entrée ne change rien
    await db.event.update({
      where: { id: event.id },
      data: { title: "Soirée déplacée" },
    });
    const t1 = (await walletTicketById(ticket.id))!;
    expect(walletFingerprint(t1)).not.toBe(walletFingerprint(t0));
    const pass = passJson(t1, APPLE);
    expect(pass).toMatchObject({
      serialNumber: ticket.id,
      authenticationToken: applePassToken(ticket.id),
    });
    expect(pass.webServiceURL).toMatch(/\/api\/wallet\/apple$/);
    expect("voided" in pass).toBe(false);
    await db.ticket.update({
      where: { id: ticket.id },
      data: { status: "REFUNDED" },
    });
    const t2 = (await walletTicketById(ticket.id))!;
    expect(t2.valid).toBe(false);
    expect(passJson(t2, APPLE)).toMatchObject({ voided: true });
  });

  it("service web Apple : jeton propre au billet ; inscription d'un téléphone, passes modifiés depuis sa dernière synchronisation, désinscription", async () => {
    const { ticket } = await billet();
    const autre = await billet();
    expect(
      passAuthorized(ticket.id, `ApplePass ${applePassToken(ticket.id)}`),
    ).toBe(true);
    expect(passAuthorized(ticket.id, "ApplePass faux")).toBe(false);
    expect(passAuthorized(ticket.id, null)).toBe(false);
    expect(
      passAuthorized(ticket.id, `ApplePass ${applePassToken(autre.ticket.id)}`),
    ).toBe(false); // le jeton d'un autre billet
    const device = `tel-${rid()}`;
    expect(await registerDevice(device, ticket.id, "jeton-push-1")).toBe(
      "CREATED",
    );
    expect(await registerDevice(device, ticket.id, "jeton-push-2")).toBe(
      "EXISTS",
    );
    expect(await registerDevice(device, "inconnu", "x")).toBe("UNKNOWN");
    const premier = (await updatedSerials(device, null))!;
    expect(premier.serialNumbers).toEqual([ticket.id]);
    expect(await updatedSerials(device, premier.lastUpdated)).toBeNull(); // rien de nouveau depuis
    await unregisterDevice(device, ticket.id);
    expect(await updatedSerials(device, null)).toBeNull();
    expect(
      await db.walletRegistration.count({
        where: { deviceLibraryIdentifier: device },
      }),
    ).toBe(0);
  });

  it("tâche régulière : seuls les passes modifiés sont renvoyés ; notification Apple, mise à jour Google (billet inactif s'il est désactivé) ; jeton périmé oublié", async () => {
    const { event, ticket } = await billet();
    await registerDevice(`tel-${rid()}`, ticket.id, `push-${rid()}`);
    await db.ticket.update({
      where: { id: ticket.id },
      data: { walletGoogle: true },
    });
    const pushes: string[][] = [];
    const calls: Array<{ url: string; body: string }> = [];
    const fakeFetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return String(url).includes("oauth2")
        ? Response.json({ access_token: "jeton-google" })
        : new Response(null, { status: 200 });
    }) as typeof fetch;
    const deps = {
      apple: APPLE,
      google: GOOGLE,
      push: async (tokens: string[]) => (pushes.push(tokens), []),
      fetch: fakeFetch,
    };
    // rien n'a changé depuis l'inscription : rien n'est envoyé
    expect(await syncWalletPasses(deps)).toMatchObject({
      changed: 0,
      applePushes: 0,
      googlePatches: 0,
    });
    // l'événement change : notification Apple, événement et billet mis à jour chez Google
    await db.event.update({
      where: { id: event.id },
      data: { title: "Soirée déplacée" },
    });
    expect(await syncWalletPasses(deps)).toMatchObject({
      changed: 1,
      applePushes: 1,
      googlePatches: 2,
    });
    expect(pushes).toHaveLength(1);
    expect(
      calls.filter((c) => c.url.includes("/eventTicketClass/")),
    ).toHaveLength(1);
    expect(
      JSON.parse(
        calls.find((c) => c.url.includes("/eventTicketObject/"))!.body,
      ),
    ).toMatchObject({ state: "ACTIVE" });
    expect(await syncWalletPasses(deps)).toMatchObject({ changed: 0 }); // déjà à jour
    // billet remboursé : pass annulé chez Apple, billet inactif chez Google
    await db.ticket.update({
      where: { id: ticket.id },
      data: { status: "REFUNDED" },
    });
    calls.length = 0;
    expect(await syncWalletPasses(deps)).toMatchObject({
      changed: 1,
      applePushes: 1,
    });
    expect(
      JSON.parse(
        calls.find((c) => c.url.includes("/eventTicketObject/"))!.body,
      ),
    ).toMatchObject({ state: "INACTIVE" });
    // jeton déclaré périmé par Apple : l'inscription est oubliée
    await db.event.update({
      where: { id: event.id },
      data: { title: "Soirée annulée" },
    });
    expect(
      (
        await syncWalletPasses({
          ...deps,
          push: async (tokens: string[]) => tokens,
        })
      ).applePushes,
    ).toBe(0);
    expect(
      await db.walletRegistration.count({ where: { ticketId: ticket.id } }),
    ).toBe(0);
  });
});
