import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeState = vi.hoisted(() => ({ available: true, retrieve: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ stripe: () => (stripeState.available ? { events: { retrieve: stripeState.retrieve } } : null) }));
const handlers = vi.hoisted(() => ({ connect: vi.fn(async () => "PROCESSED"), platform: vi.fn(async () => "PROCESSED") }));
vi.mock("@/server/stripeConnectEvents", () => ({ handleConnectEvent: handlers.connect }));
vi.mock("@/server/stripePlatformEvents", () => ({ handlePlatformEvent: handlers.platform }));

const { db } = await import("@/lib/db");
const { retryFailedWebhooks } = await import("@/server/webhookRetry");

const rid = () => Math.random().toString(36).slice(2, 10);
// une période que les autres tests n'utilisent pas : leurs événements en échec ne sont jamais concernés
const now = new Date("2099-01-10T12:00:00Z");
const failed = (over: { accountId?: string | null; attempts?: number; receivedAt?: Date } = {}) =>
  db.stripeWebhookEvent.create({
    data: {
      id: `evt_${rid()}`,
      type: "charge.refunded",
      status: "FAILED",
      attempts: over.attempts ?? 1,
      accountId: over.accountId ?? null,
      receivedAt: over.receivedAt ?? new Date("2099-01-09T12:00:00Z"),
    },
  });

beforeEach(() => {
  stripeState.available = true;
  stripeState.retrieve.mockReset();
  stripeState.retrieve.mockImplementation(async (id: string) => ({ id, type: "charge.refunded" }));
  handlers.connect.mockClear();
  handlers.platform.mockClear();
});

describe("rejeu des événements Stripe en échec (section 11)", () => {
  it("sans Stripe, rien n'est rejoué", async () => {
    stripeState.available = false;
    expect(await retryFailedWebhooks(now)).toEqual({ retried: 0, failed: 0 });
  });

  it("chaque événement dû est relu chez Stripe sur le bon compte, puis traité par le bon gestionnaire", async () => {
    const platform = await failed();
    const connect = await failed({ accountId: "acct_club" });
    const r = await retryFailedWebhooks(now);
    expect(r.retried).toBeGreaterThanOrEqual(2);
    expect(stripeState.retrieve).toHaveBeenCalledWith(platform.id, undefined, undefined);
    expect(stripeState.retrieve).toHaveBeenCalledWith(connect.id, undefined, { stripeAccount: "acct_club" });
    expect(handlers.platform).toHaveBeenCalled();
    expect(handlers.connect).toHaveBeenCalled();
    expect((await db.stripeWebhookEvent.findUniqueOrThrow({ where: { id: platform.id } })).status).toBe("PROCESSED");
  });

  it("trop ancien (plus de 3 jours) ou déjà tenté 10 fois : laissé de côté", async () => {
    const old = await failed({ receivedAt: new Date("2099-01-05T12:00:00Z") });
    const tired = await failed({ attempts: 10 });
    await retryFailedWebhooks(now);
    const ids = stripeState.retrieve.mock.calls.map((c) => c[0]);
    expect(ids).not.toContain(old.id);
    expect(ids).not.toContain(tired.id);
  });

  it("un événement introuvable chez Stripe est compté en échec, sans bloquer les autres", async () => {
    const lost = await failed();
    stripeState.retrieve.mockImplementation(async (id: string) => {
      if (id === lost.id) throw new Error("introuvable");
      return { id, type: "charge.refunded" };
    });
    const r = await retryFailedWebhooks(now);
    expect(r.failed).toBeGreaterThanOrEqual(1);
    expect((await db.stripeWebhookEvent.findUniqueOrThrow({ where: { id: lost.id } })).status).toBe("FAILED");
  });
});
