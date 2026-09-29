import { describe, expect, it } from "vitest";
import { canAssignRole, cleanPermissions, invitationUsable, PERMISSION_GROUPS, PERMISSIONS } from "../src";

describe("équipe (section 9.3)", () => {
  it("anti-escalade : jamais plus de droits que les siens, jamais le rôle de propriétaire", () => {
    const manager = ["MEMBERS_MANAGE", "EVENTS_EDIT", "ORDERS_VIEW"] as const;
    expect(canAssignRole(manager, { permissions: ["EVENTS_EDIT"] })).toBe(true);
    expect(canAssignRole(manager, { permissions: ["EVENTS_EDIT", "FINANCE_VIEW"] })).toBe(false);
    expect(canAssignRole(PERMISSIONS, { systemKey: "OWNER", permissions: [] })).toBe(false);
    expect(canAssignRole(PERMISSIONS, { systemKey: "ADMIN", permissions: [...PERMISSIONS] })).toBe(true);
  });
  it("permissions d'un rôle personnalisé", () => {
    expect(cleanPermissions(["EVENTS_EDIT", "ORDERS_VIEW"])).toEqual(["EVENTS_EDIT", "ORDERS_VIEW"]);
    expect(cleanPermissions(["EVENTS_EDIT", "SUPER_POUVOIR"])).toBeNull();
    expect(cleanPermissions([])).toBeNull();
  });
  it("invitation : 48 heures, usage unique (RG-ORG-02)", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(invitationUsable({ status: "PENDING", expiresAt: new Date("2026-10-11T12:00:00Z") }, now)).toBe("OK");
    expect(invitationUsable({ status: "PENDING", expiresAt: new Date("2026-10-10T11:00:00Z") }, now)).toBe("EXPIRED");
    expect(invitationUsable({ status: "ACCEPTED", expiresAt: new Date("2026-10-11T12:00:00Z") }, now)).toBe("USED");
    expect(invitationUsable({ status: "REVOKED", expiresAt: new Date("2026-10-11T12:00:00Z") }, now)).toBe("REVOKED");
  });
  it("chaque permission appartient à exactement un groupe de l'éditeur", () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions);
    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort());
  });
});
