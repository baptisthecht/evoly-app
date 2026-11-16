import { describe, expect, it } from "vitest";
import {
  buyerBearsRefundFees,
  checkRefundRequest,
  REFUND_APPLICATION_FEE,
  refundAmount,
  refundFeesWithheld,
  refundRuleOf,
  type RefundRequestInput,
} from "../src";

const startsAt = new Date("2026-11-14T20:00:00Z");
const base: RefundRequestInput = {
  policy: "UNTIL_DEADLINE",
  deadlineAt: new Date("2026-11-07T00:00:00Z"),
  eventStatus: "PUBLISHED",
  eventStartsAt: startsAt,
  now: new Date("2026-11-01T12:00:00Z"),
};

describe("demande de remboursement (RG-REF-01, RG-EVT-05)", () => {
  it("dans le délai", () =>
    expect(checkRefundRequest(base)).toEqual({
      canRequest: true,
      outOfDeadline: false,
      reason: "BUYER_REQUEST",
    }));
  it("hors délai : demande possible, marquée comme telle", () => {
    expect(
      checkRefundRequest({ ...base, now: new Date("2026-11-08T00:00:00Z") }),
    ).toEqual({
      canRequest: true,
      outOfDeadline: true,
      reason: "BUYER_REQUEST",
    });
  });
  it("sans date limite : le début de l'événement fait foi", () => {
    expect(
      checkRefundRequest({
        ...base,
        deadlineAt: null,
        now: new Date("2026-11-14T21:00:00Z"),
      }).outOfDeadline,
    ).toBe(true);
  });
  it("non remboursable", () =>
    expect(
      checkRefundRequest({ ...base, policy: "NON_REFUNDABLE" }).canRequest,
    ).toBe(false));
  it("toujours remboursable jusqu'au début", () => {
    expect(checkRefundRequest({ ...base, policy: "ALWAYS" }).canRequest).toBe(
      true,
    );
    expect(
      checkRefundRequest({
        ...base,
        policy: "ALWAYS",
        now: new Date("2026-11-14T21:00:00Z"),
      }),
    ).toEqual({
      canRequest: false,
      outOfDeadline: true,
      reason: "BUYER_REQUEST",
    });
  });
  it("sur demande", () => {
    expect(checkRefundRequest({ ...base, policy: "ON_REQUEST" })).toEqual({
      canRequest: true,
      outOfDeadline: false,
      reason: "BUYER_REQUEST",
    });
    expect(
      checkRefundRequest({
        ...base,
        policy: "ON_REQUEST",
        now: new Date("2026-11-15T00:00:00Z"),
      }).outOfDeadline,
    ).toBe(true);
  });
  it("changement de date ou de lieu : 14 jours pour demander", () => {
    const changed = {
      ...base,
      policy: "NON_REFUNDABLE" as const,
      lastMajorChangeAt: new Date("2026-10-25T00:00:00Z"),
    };
    expect(checkRefundRequest(changed)).toEqual({
      canRequest: true,
      outOfDeadline: false,
      reason: "EVENT_CHANGED",
    });
    expect(
      checkRefundRequest({ ...changed, now: new Date("2026-11-08T00:00:01Z") })
        .canRequest,
    ).toBe(false);
  });
  it("événement annulé : remboursement automatique, pas de demande", () => {
    expect(
      checkRefundRequest({ ...base, eventStatus: "CANCELLED" }).canRequest,
    ).toBe(false);
  });
});

describe("montants", () => {
  it("prix payé des billets encore valides (RG-REF-02)", () => {
    expect(
      refundAmount([
        { faceValueMinor: 2400, status: "VALID" },
        { faceValueMinor: 2400, status: "CHECKED_IN" },
        { faceValueMinor: 2400, status: "REFUNDED" },
      ]),
    ).toBe(4800);
  });
  it("commission toujours conservée (RG-FEE-40)", () => {
    expect(REFUND_APPLICATION_FEE).toBe(false);
  });
});

describe("remboursement à coût neutre : frais retenus (mode « moins les frais »)", () => {
  const order = {
    orderTotalMinor: 5_000,
    applicationFeeMinor: 150,
    paymentFeeMinor: 100,
  };
  it("intégral : rien n'est retenu", () => {
    expect(
      refundFeesWithheld({ ...order, mode: "FULL", grossMinor: 5_000 }),
    ).toBe(0);
  });
  it("moins les frais, commande entière : frais de paiement et commission retenus", () => {
    expect(
      refundFeesWithheld({ ...order, mode: "MINUS_FEES", grossMinor: 5_000 }),
    ).toBe(250);
  });
  it("moins les frais, remboursement partiel : au prorata, jamais plus que ce qui reste à retenir", () => {
    expect(
      refundFeesWithheld({ ...order, mode: "MINUS_FEES", grossMinor: 2_000 }),
    ).toBe(100);
    expect(
      refundFeesWithheld({
        ...order,
        mode: "MINUS_FEES",
        grossMinor: 3_000,
        alreadyWithheldMinor: 200,
      }),
    ).toBe(50);
  });
  it("commande gratuite, ou frais plus élevés que le montant : jamais au-delà du montant remboursé", () => {
    expect(
      refundFeesWithheld({
        mode: "MINUS_FEES",
        grossMinor: 0,
        orderTotalMinor: 0,
        applicationFeeMinor: 0,
        paymentFeeMinor: 0,
      }),
    ).toBe(0);
    expect(
      refundFeesWithheld({
        mode: "MINUS_FEES",
        grossMinor: 100,
        orderTotalMinor: 100,
        applicationFeeMinor: 90,
        paymentFeeMinor: 40,
      }),
    ).toBe(100);
  });
  it("seul l'acheteur qui demande pour son propre motif supporte les frais", () => {
    expect(
      buyerBearsRefundFees({ initiator: "BUYER", reason: "BUYER_REQUEST" }),
    ).toBe(true);
    for (const r of [
      { initiator: "BUYER", reason: "EVENT_CHANGED" },
      { initiator: "SYSTEM", reason: "EVENT_CANCELLED" },
      { initiator: "ORGANIZER", reason: "BUYER_REQUEST" },
      { initiator: "ORGANIZER", reason: "OTHER" },
    ])
      expect(buyerBearsRefundFees(r)).toBe(false);
  });
});

describe("règle de remboursement affichée avant l'achat (RG-REF-11)", () => {
  it("politique et date limite de l'événement, mode figé sur la commande", () => {
    expect(
      refundRuleOf(
        {
          refundPolicy: "UNTIL_DEADLINE",
          refundDeadlineAt: new Date("2026-12-12T10:00:00Z"),
          timezone: "Europe/Brussels",
        },
        "MINUS_FEES",
      ),
    ).toEqual({
      policy: "UNTIL_DEADLINE",
      deadlineAt: "2026-12-12T10:00:00.000Z",
      timezone: "Europe/Brussels",
      feeMode: "MINUS_FEES",
    });
    expect(
      refundRuleOf(
        {
          refundPolicy: "ALWAYS",
          refundDeadlineAt: null,
          timezone: "Europe/Paris",
        },
        "FULL",
      ).deadlineAt,
    ).toBeNull();
  });
});
