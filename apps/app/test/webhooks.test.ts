import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { processStripeEvent } from "@/server/webhooks";

const rid = () => Math.random().toString(36).slice(2, 10);
const event = (account?: string) =>
  ({
    id: `evt_${rid()}`,
    type: "payment_intent.succeeded",
    account,
  }) as unknown as Stripe.Event;
const row = (id: string) =>
  db.stripeWebhookEvent.findUniqueOrThrow({ where: { id } });

describe("réception idempotente des événements Stripe (RG-ARC-05)", () => {
  it("un événement reçu deux fois n'est traité qu'une fois", async () => {
    const e = event();
    const handle = vi.fn(async () => "PROCESSED" as const);
    expect(await processStripeEvent(e, handle)).toEqual({ duplicate: false });
    expect(await processStripeEvent(e, handle)).toEqual({ duplicate: true });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(await row(e.id)).toMatchObject({
      status: "PROCESSED",
      attempts: 1,
      lastError: null,
      accountId: null,
      type: "payment_intent.succeeded",
    });
    expect((await row(e.id)).processedAt).not.toBeNull();
  });

  it("un événement ignoré est considéré comme réglé", async () => {
    const e = event();
    const handle = vi.fn(async () => "IGNORED" as const);
    await processStripeEvent(e, handle);
    expect(await processStripeEvent(e, handle)).toEqual({ duplicate: true });
    expect(await row(e.id)).toMatchObject({ status: "IGNORED", attempts: 1 });
  });

  it("un échec est noté avec son erreur et remonte ; rejoué, il est traité et l'erreur effacée", async () => {
    const e = event();
    await expect(
      processStripeEvent(e, async () =>
        Promise.reject(new Error("panne du traitement")),
      ),
    ).rejects.toThrow("panne du traitement");
    expect(await row(e.id)).toMatchObject({ status: "FAILED", attempts: 1 });
    expect((await row(e.id)).lastError).toContain("panne du traitement");
    expect(await processStripeEvent(e, async () => "PROCESSED")).toEqual({
      duplicate: false,
    });
    expect(await row(e.id)).toMatchObject({
      status: "PROCESSED",
      attempts: 2,
      lastError: null,
    });
  });

  it("le compte connecté est gardé, pour relire l'événement au bon endroit lors d'un rejeu", async () => {
    const e = event("acct_club");
    await processStripeEvent(e, async () => "PROCESSED");
    expect((await row(e.id)).accountId).toBe("acct_club");
  });

  it("deux réceptions simultanées du même événement : un seul traitement", async () => {
    const e = event();
    const handle = vi.fn(async () => "PROCESSED" as const);
    const both = await Promise.all([
      processStripeEvent(e, handle),
      processStripeEvent(e, handle),
    ]);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(both.filter((r) => r.duplicate)).toHaveLength(1);
  });
});
