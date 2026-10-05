import { describe, expect, it } from "vitest";
import {
  can,
  canCreateOrganization,
  canOwnerOnly,
  effectivePlan,
  hasFeature,
  isPermission,
  isReadOnlyOrganization,
  PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
} from "../src";

const now = new Date("2026-10-20T12:00:00Z");
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("offre en vigueur (RG-SUB-06, RG-SUB-08)", () => {
  it.each([
    [null, "free"],
    [{ planId: "free", status: "NONE" as const }, "free"],
    [{ planId: "pro", status: "TRIALING" as const }, "pro"],
    [{ planId: "pro", status: "ACTIVE" as const }, "pro"],
    [{ planId: "pro", status: "PAST_DUE" as const }, "pro"],
    [{ planId: "pro", status: "PAST_DUE" as const, pastDueSince: days(6) }, "pro"],
    [{ planId: "pro", status: "PAST_DUE" as const, pastDueSince: days(7) }, "free"],
    [{ planId: "pro", status: "CANCELED" as const, currentPeriodEnd: new Date("2026-10-31T00:00:00Z") }, "pro"],
    [{ planId: "pro", status: "CANCELED" as const, currentPeriodEnd: days(1) }, "free"],
    [{ planId: "pro", status: "UNPAID" as const }, "free"],
  ])("%j → %s", (sub, expected) => expect(effectivePlan(sub, now)).toBe(expected));

  it("fonctionnalités", () => {
    expect(hasFeature(["RESALE", "LIVE_STATS"], "RESALE")).toBe(true);
    expect(hasFeature(["RESALE"], "DYNAMIC_PRICING")).toBe(false);
  });
  it("une seule organisation en Free (RG-ORG-04)", () => {
    expect(canCreateOrganization({ ownedFreeOrganizations: 0, startsAsPro: false })).toBe(true);
    expect(canCreateOrganization({ ownedFreeOrganizations: 1, startsAsPro: false })).toBe(false);
    expect(canCreateOrganization({ ownedFreeOrganizations: 1, startsAsPro: true })).toBe(true);
    expect(isReadOnlyOrganization({ plan: "free", isOwnersFirstFreeOrganization: false })).toBe(true);
    expect(isReadOnlyOrganization({ plan: "free", isOwnersFirstFreeOrganization: true })).toBe(false);
    expect(isReadOnlyOrganization({ plan: "pro", isOwnersFirstFreeOrganization: false })).toBe(false);
  });
});

describe("permissions (annexe B)", () => {
  it("propriétaire et administrateur ont tout", () => {
    expect(SYSTEM_ROLE_PERMISSIONS.OWNER).toHaveLength(PERMISSIONS.length);
    expect(SYSTEM_ROLE_PERMISSIONS.ADMIN).toHaveLength(PERMISSIONS.length);
  });
  it("les autres rôles sont limités", () => {
    expect(SYSTEM_ROLE_PERMISSIONS.MANAGER).not.toContain("FINANCE_VIEW");
    expect(SYSTEM_ROLE_PERMISSIONS.MANAGER).not.toContain("EVENTS_DELETE");
    expect(SYSTEM_ROLE_PERMISSIONS.SCANNER).toEqual(["CHECKIN_SCAN"]);
    expect(SYSTEM_ROLE_PERMISSIONS.VIEWER).toEqual(["STATS_VIEW", "ORDERS_VIEW"]);
  });
  it("contrôle unique can()", () => {
    const manager = { status: "ACTIVE" as const, systemRole: "MANAGER" as const, permissions: SYSTEM_ROLE_PERMISSIONS.MANAGER };
    expect(can(manager, "EVENTS_PUBLISH")).toBe(true);
    expect(can(manager, "FINANCE_VIEW")).toBe(false);
    expect(can({ ...manager, status: "SUSPENDED" }, "EVENTS_PUBLISH")).toBe(false);
    expect(can(null, "EVENTS_PUBLISH")).toBe(false);
  });
  it("actions réservées au propriétaire", () => {
    const owner = { status: "ACTIVE" as const, systemRole: "OWNER" as const, permissions: PERMISSIONS };
    const admin = { status: "ACTIVE" as const, systemRole: "ADMIN" as const, permissions: PERMISSIONS };
    expect(canOwnerOnly(owner, "ORGANIZATION_DELETE")).toBe(true);
    expect(canOwnerOnly(admin, "ORGANIZATION_DELETE")).toBe(false);
    expect(canOwnerOnly(null, "OWNERSHIP_TRANSFER")).toBe(false);
  });
  it("isPermission", () => {
    expect(isPermission("EVENTS_EDIT")).toBe(true);
    expect(isPermission("ROOT")).toBe(false);
  });
});
