import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  // Get the organization and verify membership
  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    include: { plan: true },
  });

  if (!org) redirect("/dashboard");

  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: session.user.id,
      },
    },
    include: { role: true },
  });

  if (!membership) redirect("/dashboard");

  // Get all user's orgs for the org switcher
  const allMemberships = await db.organizationMember.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { joinedAt: "asc" },
  });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <DashboardSidebar
        currentOrg={org}
        allOrgs={allMemberships.map((m) => m.organization)}
        userPermissions={membership.role.permissions}
        user={user!}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with notification bell */}
        <div className="h-12 bg-white border-b border-gray-100 flex items-center justify-end px-4 flex-shrink-0">
          <NotificationBell orgSlug={orgSlug} />
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
