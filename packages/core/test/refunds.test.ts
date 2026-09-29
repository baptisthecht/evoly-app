import { describe, expect, it } from "vitest";
import { checkRefundRequest, REFUND_APPLICATION_FEE, refundAmount, type RefundRequestInput } from "../src";

const startsAt = new Date("2026-11-14T20:00:00Z");
const base: RefundRequestInput = { policy: "UNTIL_DEADLINE", deadlineAt: new Date("2026-11-07T00:00:00Z"), eventStatus: "PUBLISHED", eventStartsAt: startsAt, now: new Date("2026-11-01T12:00:00Z") };

describe("demande de remboursement (RG-REF-01, RG-EVT-05)", () => {
  it("dans le délai", () => expect(checkRefundRequest(base)).toEqual({ canRequest: true, outOfDeadline: false, reason: "BUYER_REQUEST" }));
  it("hors délai : demande possible, marquée comme telle", () => {
    expect(checkRefundRequest({ ...base, now: new Date("2026-11-08T00:00:00Z") })).toEqual({ canRequest: true, outOfDeadline: true, reason: "BUYER_REQUEST" });
  });
  it("sans date limite : le début de l'événement fait foi", () => {
    expect(checkRefundRequest({ ...base, deadlineAt: null, now: new Date("2026-11-14T21:00:00Z") }).outOfDeadline).toBe(true);
  });
  it("non remboursable", () => expect(checkRefundRequest({ ...base, policy: "NON_REFUNDABLE" }).canRequest).toBe(false));
  it("toujours remboursable jusqu'au début", () => {
    expect(checkRefundRequest({ ...base, policy: "ALWAYS" }).canRequest).toBe(true);
    expect(checkRefundRequest({ ...base, policy: "ALWAYS", now: new Date("2026-11-14T21:00:00Z") })).toEqual({ canRequest: false, outOfDeadline: true, reason: "BUYER_REQUEST" });
  });
  it("sur demande", () => {
    expect(checkRefundRequest({ ...base, policy: "ON_REQUEST" })).toEqual({ canRequest: true, outOfDeadline: false, reason: "BUYER_REQUEST" });
    expect(checkRefundRequest({ ...base, policy: "ON_REQUEST", now: new Date("2026-11-15T00:00:00Z") }).outOfDeadline).toBe(true);
  });
  it("changement de date ou de lieu : 14 jours pour demander", () => {
    const changed = { ...base, policy: "NON_REFUNDABLE" as const, lastMajorChangeAt: new Date("2026-10-25T00:00:00Z") };
    expect(checkRefundRequest(changed)).toEqual({ canRequest: true, outOfDeadline: false, reason: "EVENT_CHANGED" });
    expect(checkRefundRequest({ ...changed, now: new Date("2026-11-08T00:00:01Z") }).canRequest).toBe(false);
  });
  it("événement annulé : remboursement automatique, pas de demande", () => {
    expect(checkRefundRequest({ ...base, eventStatus: "CANCELLED" }).canRequest).toBe(false);
  });
});

describe("montants", () => {
  it("prix payé des billets encore valides (RG-REF-02)", () => {
    expect(refundAmount([{ faceValueMinor: 2400, status: "VALID" }, { faceValueMinor: 2400, status: "CHECKED_IN" }, { faceValueMinor: 2400, status: "REFUNDED" }])).toBe(4800);
  });
  it("commission toujours conservée (RG-FEE-40)", () => {
    expect(REFUND_APPLICATION_FEE).toBe(false);
  });
});
