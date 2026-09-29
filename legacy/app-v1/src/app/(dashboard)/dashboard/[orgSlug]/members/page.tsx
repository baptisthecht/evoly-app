import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { MembersManager } from "@/components/members/MembersManager";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, slug: true },
  });
  if (!org) redirect("/dashboard");

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  const perms = membership?.role.permissions ?? [];
  const canInvite = perms.includes("MEMBERS_INVITE");
  const canManageRoles = perms.includes("MEMBERS_MANAGE_ROLES");
  const canRemove = perms.includes("MEMBERS_REMOVE");
  const canCreateRoles = perms.includes("ROLES_CREATE");

  if (!canInvite && !canManageRoles) redirect(`/dashboard/${orgSlug}`);

  const members = await db.organizationMember.findMany({
    where: { organizationId: org.id },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      role: { select: { id: true, name: true, isSystem: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  const pendingInvitations = await db.invitation.findMany({
    where: { organizationId: org.id, status: "PENDING" },
    include: { organization: false },
    orderBy: { createdAt: "desc" },
  });

  const roles = await db.role.findMany({
    where: { OR: [{ organizationId: org.id }, { isSystem: true }] },
    include: { _count: { select: { members: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return (
    <div className="p-6">
      <MembersManager
        organizationId={org.id}
        orgSlug={org.slug}
        currentUserId={session.user.id}
        canInvite={canInvite}
        canManageRoles={canManageRoles}
        canRemove={canRemove}
        canCreateRoles={canCreateRoles}
        members={members.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user.name ?? m.user.email ?? "—",
          email: m.user.email ?? "",
          avatarUrl: m.user.avatarUrl,
          roleId: m.role.id,
          roleName: m.role.name,
          isSystemRole: m.role.isSystem,
          joinedAt: m.joinedAt.toISOString(),
        }))}
        invitations={pendingInvitations.map((i) => ({
          id: i.id,
          email: i.email,
          roleId: i.roleId,
          token: i.token,
          expiresAt: i.expiresAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
        }))}
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          isSystem: r.isSystem,
          membersCount: r._count.members,
          permissions: r.permissions,
        }))}
      />
    </div>
  );
}
