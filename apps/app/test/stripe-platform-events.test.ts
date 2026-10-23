import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const billing = vi.hoisted(() => ({
  syncSubscription: vi.fn(),
  trialEnding: vi.fn(),
  invoicePaid: vi.fn(),
  invoiceFailed: vi.fn(),
  invoiceSubscriptionId: vi.fn(
    (invoice: { subscription?: string }) => invoice.subscription ?? null,
  ),
}));
vi.mock("@/server/billing", () => billing);
const stripeState = vi.hoisted(() => ({
  available: true,
  retrieve: vi.fn(async (id: string) => ({ id, object: "subscription" })),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () =>
    stripeState.available
      ? { subscriptions: { retrieve: stripeState.retrieve } }
      : null,
}));

const { handlePlatformEvent } = await import("@/server/stripePlatformEvents");
const ev = (type: string, object: Record<string, unknown>) =>
  ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;

beforeEach(() => {
  stripeState.available = true;
  stripeState.retrieve.mockClear();
  for (const f of Object.values(billing)) f.mockClear();
  billing.syncSubscription.mockResolvedValue(true);
});

describe("événements des abonnements Pro (RG-PAY-06)", () => {
  it("paiement d'un abonnement terminé : l'abonnement est relu chez Stripe puis synchronisé", async () => {
    expect(
      await handlePlatformEvent(
        ev("checkout.session.completed", {
          mode: "subscription",
          subscription: "sub_1",
        }),
      ),
    ).toBe("PROCESSED");
    expect(stripeState.retrieve).toHaveBeenCalledWith("sub_1");
    expect(billing.syncSubscription).toHaveBeenCalledWith({
      id: "sub_1",
      object: "subscription",
    });
    expect(
      await handlePlatformEvent(
        ev("checkout.session.completed", {
          mode: "subscription",
          subscription: { id: "sub_2" },
        }),
      ),
    ).toBe("PROCESSED");
    expect(stripeState.retrieve).toHaveBeenLastCalledWith("sub_2"); // abonnement déjà développé dans la session
  });

  it("une session qui n'est pas un abonnement est ignorée ; sans abonnement synchronisé, ignorée aussi", async () => {
    expect(
      await handlePlatformEvent(
        ev("checkout.session.completed", {
          mode: "payment",
          subscription: null,
        }),
      ),
    ).toBe("IGNORED");
    expect(
      await handlePlatformEvent(
        ev("checkout.session.completed", {
          mode: "subscription",
          subscription: null,
        }),
      ),
    ).toBe("IGNORED");
    billing.syncSubscription.mockResolvedValue(false);
    expect(
      await handlePlatformEvent(
        ev("checkout.session.completed", {
          mode: "subscription",
          subscription: "sub_1",
        }),
      ),
    ).toBe("IGNORED");
  });

  it("Stripe indisponible : erreur, pour que l'événement soit rejoué plus tard", async () => {
    stripeState.available = false;
    await expect(
      handlePlatformEvent(
        ev("checkout.session.completed", {
          mode: "subscription",
          subscription: "sub_1",
        }),
      ),
    ).rejects.toThrow("Stripe non configuré");
  });

  it("création, modification et suppression d'un abonnement : synchronisés", async () => {
    for (const type of [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]) {
      expect(await handlePlatformEvent(ev(type, { id: "sub_9" }))).toBe(
        "PROCESSED",
      );
    }
    expect(billing.syncSubscription).toHaveBeenCalledTimes(3);
    billing.syncSubscription.mockResolvedValue(false);
    expect(
      await handlePlatformEvent(
        ev("customer.subscription.updated", { id: "sub_9" }),
      ),
    ).toBe("IGNORED");
  });

  it("fin d'essai prochaine : prévenue", async () => {
    expect(
      await handlePlatformEvent(
        ev("customer.subscription.trial_will_end", { id: "sub_3" }),
      ),
    ).toBe("PROCESSED");
    expect(billing.trialEnding).toHaveBeenCalledWith({ id: "sub_3" });
  });

  it("facture payée et paiement échoué : rattachés à leur abonnement", async () => {
    expect(
      await handlePlatformEvent(ev("invoice.paid", { subscription: "sub_4" })),
    ).toBe("PROCESSED");
    expect(billing.invoicePaid).toHaveBeenCalledWith("sub_4");
    expect(
      await handlePlatformEvent(
        ev("invoice.payment_failed", { subscription: "sub_5" }),
      ),
    ).toBe("PROCESSED");
    expect(billing.invoiceFailed).toHaveBeenCalledWith("sub_5");
  });

  it("un autre événement est ignoré, sans rien toucher", async () => {
    expect(await handlePlatformEvent(ev("charge.dispute.created", {}))).toBe(
      "IGNORED",
    );
    expect(billing.syncSubscription).not.toHaveBeenCalled();
  });
});
