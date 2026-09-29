import { db, Permission } from "@evoly/db";

/**
 * Check if a user has a specific permission in an organization.
 * Always called server-side. Never trust client.
 */
export async function checkPermission(
  userId: string,
  organizationId: string,
  permission: Permission
): Promise<boolean> {
  const member = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: {
      role: true,
    },
  });

  if (!member) return false;

  return member.role.permissions.includes(permission);
}

/**
 * Check multiple permissions (AND logic — all must pass).
 */
export async function checkPermissions(
  userId: string,
  organizationId: string,
  permissions: Permission[]
): Promise<boolean> {
  const member = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: {
      role: true,
    },
  });

  if (!member) return false;

  return permissions.every((p) => member.role.permissions.includes(p));
}

/**
 * Throws an error if the user does not have the required permission.
 */
export async function requirePermission(
  userId: string,
  organizationId: string,
  permission: Permission
): Promise<void> {
  const ok = await checkPermission(userId, organizationId, permission);
  if (!ok) {
    throw new Error("UNAUTHORIZED");
  }
}

/**
 * Get the member record with role for a user in an org.
 */
export async function getMember(userId: string, organizationId: string) {
  return db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: {
      role: true,
      organization: true,
    },
  });
}

/**
 * Get all organizations a user belongs to.
 */
export async function getUserOrganizations(userId: string) {
  return db.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        include: { plan: true },
      },
      role: true,
    },
    orderBy: { joinedAt: "asc" },
  });
}

export { Permission };
