import { describe, expect, it } from "vitest";
import { attendance, decideCheckIn, earliestWins, isShortCode, normalizeShortCode, trustedScanTime } from "../src";

describe("scanner (section 9.17)", () => {
  it("décision selon le billet", () => {
    expect(decideCheckIn(null, "e1")).toBe("INVALID");
    expect(decideCheckIn({ eventId: "e2", status: "VALID" }, "e1")).toBe("WRONG_EVENT");
    expect(decideCheckIn({ eventId: "e1", status: "VALID" }, "e1")).toBe("VALID");
    expect(decideCheckIn({ eventId: "e1", status: "CHECKED_IN" }, "e1")).toBe("ALREADY_USED");
    expect(decideCheckIn({ eventId: "e1", status: "VOID" }, "e1")).toBe("VOID");
    expect(decideCheckIn({ eventId: "e1", status: "REFUNDED" }, "e1")).toBe("VOID");
  });
  it("code court saisi à la main", () => {
    expect(normalizeShortCode(" w6ue-9738 ")).toBe("W6UE9738");
    expect(isShortCode("w6ue 9738")).toBe(true);
    expect(isShortCode("W6UE973")).toBe(false);
    expect(isShortCode("W6UE973O")).toBe(false); // O n'existe pas dans l'alphabet des codes
  });
  it("horodatage des scans hors ligne borné", () => {
    const now = new Date("2026-10-19T20:00:00Z");
    expect(trustedScanTime(new Date("2026-10-19T19:30:00Z"), now).toISOString()).toBe("2026-10-19T19:30:00.000Z");
    expect(trustedScanTime(new Date("2026-10-19T20:30:00Z"), now)).toBe(now);
    expect(trustedScanTime(new Date("2026-10-10T20:00:00Z"), now)).toBe(now);
    expect(trustedScanTime(new Date("invalide"), now)).toBe(now);
    expect(trustedScanTime(null, now)).toBe(now);
  });
  it("le premier scan horodaté l'emporte", () => {
    expect(earliestWins(null, new Date("2026-10-19T20:00:00Z")).winner).toBe(true);
    expect(earliestWins(new Date("2026-10-19T20:05:00Z"), new Date("2026-10-19T20:00:00Z")).winner).toBe(true);
    expect(earliestWins(new Date("2026-10-19T19:55:00Z"), new Date("2026-10-19T20:00:00Z")).winner).toBe(false);
  });
  it("statistiques de présence", () => {
    const s = attendance([
      { ticketTypeName: "Fosse", status: "CHECKED_IN" },
      { ticketTypeName: "Fosse", status: "VALID" },
      { ticketTypeName: "VIP", status: "CHECKED_IN" },
      { ticketTypeName: "VIP", status: "REFUNDED" },
    ]);
    expect(s).toEqual({
      present: 2,
      total: 3,
      rateBps: 6667,
      byType: [
        { name: "Fosse", present: 1, total: 2 },
        { name: "VIP", present: 1, total: 1 },
      ],
    });
    expect(attendance([]).rateBps).toBe(0);
  });
});
