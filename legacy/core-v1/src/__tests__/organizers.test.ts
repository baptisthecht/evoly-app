import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkPermission,
  checkPermissions,
  requirePermission,
  getMember,
  getUserOrganizations,
} from "../organizers/index.js";

vi.mock("@evoly/db", () => ({
  db: {
    organizationMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
  // Export Permission as a plain object (mirrors the Prisma enum)
  Permission: {
    EVENTS_CREATE: "EVENTS_CREATE",
    EVENTS_EDIT: "EVENTS_EDIT",
    EVENTS_DELETE: "EVENTS_DELETE",
    EVENTS_PUBLISH: "EVENTS_PUBLISH",
    TICKETS_VIEW: "TICKETS_VIEW",
    TICKETS_REFUND: "TICKETS_REFUND",
    CHECKIN_SCAN: "CHECKIN_SCAN",
    MEMBERS_INVITE: "MEMBERS_INVITE",
    MEMBERS_REMOVE: "MEMBERS_REMOVE",
    MEMBERS_MANAGE_ROLES: "MEMBERS_MANAGE_ROLES",
    FINANCE_VIEW: "FINANCE_VIEW",
    FINANCE_MANAGE: "FINANCE_MANAGE",
    SETTINGS_EDIT: "SETTINGS_EDIT",
    BILLING_MANAGE: "BILLING_MANAGE",
    ROLES_CREATE: "ROLES_CREATE",
    ROLES_EDIT: "ROLES_EDIT",
    ROLES_DELETE: "ROLES_DELETE",
  },
}));

import { db, Permission } from "@evoly/db";

const mockDb = db as unknown as {
  organizationMember: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const makeMember = (permissions: string[]) => ({
  role: { permissions },
  organization: { id: "org-1", name: "Test Org" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkPermission
// ---------------------------------------------------------------------------
describe("checkPermission", () => {
  it("returns false when member does not exist", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(null);
    expect(
      await checkPermission("user-1", "org-1", Permission.EVENTS_CREATE)
    ).toBe(false);
  });

  it("returns true when member has the permission", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(
      makeMember([Permission.EVENTS_CREATE])
    );
    expect(
      await checkPermission("user-1", "org-1", Permission.EVENTS_CREATE)
    ).toBe(true);
  });

  it("returns false when member does not have the permission", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(
      makeMember([Permission.TICKETS_VIEW])
    );
    expect(
      await checkPermission("user-1", "org-1", Permission.EVENTS_CREATE)
    ).toBe(false);
  });

  it("uses the composite unique key to find the member", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(null);
    await checkPermission("user-42", "org-99", Permission.FINANCE_VIEW);
    expect(mockDb.organizationMember.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_userId: { organizationId: "org-99", userId: "user-42" },
      },
      include: { role: true },
    });
  });
});

// ---------------------------------------------------------------------------
// checkPermissions (AND logic)
// ---------------------------------------------------------------------------
describe("checkPermissions", () => {
  it("returns false when member does not exist", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(null);
    expect(
      await checkPermissions("user-1", "org-1", [
        Permission.EVENTS_CREATE,
        Permission.EVENTS_EDIT,
      ])
    ).toBe(false);
  });

  it("returns true when member has all required permissions", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(
      makeMember([Permission.EVENTS_CREATE, Permission.EVENTS_EDIT])
    );
    expect(
      await checkPermissions("user-1", "org-1", [
        Permission.EVENTS_CREATE,
        Permission.EVENTS_EDIT,
      ])
    ).toBe(true);
  });

  it("returns false when member has only some of the required permissions", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(
      makeMember([Permission.EVENTS_CREATE])
    );
    expect(
      await checkPermissions("user-1", "org-1", [
        Permission.EVENTS_CREATE,
        Permission.EVENTS_EDIT,
      ])
    ).toBe(false);
  });

  it("returns true for empty permissions array", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(makeMember([]));
    expect(await checkPermissions("user-1", "org-1", [])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requirePermission
// ---------------------------------------------------------------------------
describe("requirePermission", () => {
  it("does not throw when user has the permission", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(
      makeMember([Permission.SETTINGS_EDIT])
    );
    await expect(
      requirePermission("user-1", "org-1", Permission.SETTINGS_EDIT)
    ).resolves.toBeUndefined();
  });

  it("throws UNAUTHORIZED when user lacks the permission", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(
      makeMember([Permission.TICKETS_VIEW])
    );
    await expect(
      requirePermission("user-1", "org-1", Permission.SETTINGS_EDIT)
    ).rejects.toThrow("UNAUTHORIZED");
  });

  it("throws UNAUTHORIZED when member does not exist", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(null);
    await expect(
      requirePermission("user-1", "org-1", Permission.EVENTS_CREATE)
    ).rejects.toThrow("UNAUTHORIZED");
  });
});

// ---------------------------------------------------------------------------
// getMember
// ---------------------------------------------------------------------------
describe("getMember", () => {
  it("delegates to db with correct args and returns the member", async () => {
    const member = makeMember([Permission.FINANCE_VIEW]);
    mockDb.organizationMember.findUnique.mockResolvedValue(member);
    const result = await getMember("user-1", "org-1");
    expect(result).toEqual(member);
    expect(mockDb.organizationMember.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_userId: { organizationId: "org-1", userId: "user-1" },
      },
      include: { role: true, organization: true },
    });
  });

  it("returns null when member not found", async () => {
    mockDb.organizationMember.findUnique.mockResolvedValue(null);
    expect(await getMember("user-missing", "org-1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getUserOrganizations
// ---------------------------------------------------------------------------
describe("getUserOrganizations", () => {
  it("calls db with correct args", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([]);
    await getUserOrganizations("user-1");
    expect(mockDb.organizationMember.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: {
        organization: { include: { plan: true } },
        role: true,
      },
      orderBy: { joinedAt: "asc" },
    });
  });

  it("returns the list from db", async () => {
    const orgs = [{ id: "m-1", organization: { id: "org-1" }, role: {} }];
    mockDb.organizationMember.findMany.mockResolvedValue(orgs);
    expect(await getUserOrganizations("user-1")).toEqual(orgs);
  });
});
