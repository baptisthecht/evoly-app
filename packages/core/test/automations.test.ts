import { describe, expect, it } from "vitest";
import { reminderDue, reminderSendAt } from "../src";

describe("rappels automatiques (US-MKT-01)", () => {
  const starts = new Date("2026-10-24T18:30:00Z"); // 20 h 30 à Bruxelles (heure d'été)
  it("heures d'envoi dans le fuseau de l'événement, changement d'heure compris", () => {
    expect(reminderSendAt(starts, "Europe/Brussels", "REMINDER_J7").toISOString()).toBe("2026-10-17T08:00:00.000Z");
    expect(reminderSendAt(starts, "Europe/Brussels", "REMINDER_J1").toISOString()).toBe("2026-10-23T08:00:00.000Z");
    expect(reminderSendAt(starts, "Europe/Brussels", "REMINDER_J0").toISOString()).toBe("2026-10-24T06:00:00.000Z");
    // événement le 1er novembre : la veille est encore à l'heure d'hiver comme le jour même
    expect(reminderSendAt(new Date("2026-11-01T19:00:00Z"), "Europe/Brussels", "REMINDER_J7").toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });
  it("à envoyer seulement entre l'heure prévue et le début, sans retard de plus de 6 heures", () => {
    const at = reminderSendAt(starts, "Europe/Brussels", "REMINDER_J1");
    expect(reminderDue(at, starts, new Date(at.getTime() - 60_000))).toBe(false);
    expect(reminderDue(at, starts, new Date(at.getTime() + 60_000))).toBe(true);
    expect(reminderDue(at, starts, new Date(at.getTime() + 7 * 3_600_000))).toBe(false);
    const j0 = reminderSendAt(new Date("2026-10-24T05:00:00Z"), "Europe/Brussels", "REMINDER_J0"); // début à 7 h, rappel prévu à 8 h
    expect(reminderDue(j0, new Date("2026-10-24T05:00:00Z"), new Date(j0.getTime() + 60_000))).toBe(false);
  });
});

describe("e-mails marketing automatiques (US-MKT-02, section 9.18)", async () => {
  const { eventCapacity, lastSeatsReached, postEventDue } = await import("../src");
  it("remerciement : de 2 heures à 26 heures après la fin", () => {
    const end = new Date("2026-10-24T22:00:00Z");
    expect(postEventDue(end, new Date("2026-10-24T23:59:00Z"))).toBe(false);
    expect(postEventDue(end, new Date("2026-10-25T00:01:00Z"))).toBe(true);
    expect(postEventDue(end, new Date("2026-10-26T00:01:00Z"))).toBe(false);
  });
  it("dernières places : moins de 10 % de la jauge, sans être complet ni illimité", () => {
    expect(lastSeatsReached({ capacity: 100, sold: 91 })).toBe(true);
    expect(lastSeatsReached({ capacity: 100, sold: 90 })).toBe(false);
    expect(lastSeatsReached({ capacity: 100, sold: 100 })).toBe(false);
    expect(lastSeatsReached({ capacity: null, sold: 500 })).toBe(false);
    expect(eventCapacity(null, [60, 40])).toBe(100);
    expect(eventCapacity(null, [60, null])).toBeNull();
    expect(eventCapacity(80, [60, null])).toBe(80);
  });
});
