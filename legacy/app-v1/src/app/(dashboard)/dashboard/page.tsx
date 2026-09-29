import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Get user's organizations
  const memberships = await db.organizationMember.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { joinedAt: "asc" },
  });

  if (memberships.length === 0) {
    // No org → go to onboarding
    redirect("/onboarding/profile");
  }

  // Redirect to last used org, or first one
  const lastOrgId = session.lastOrganizationId;
  const targetOrg = lastOrgId
    ? memberships.find((m) => m.organizationId === lastOrgId) ?? memberships[0]
    : memberships[0];

  redirect(`/dashboard/${targetOrg.organization.slug}`);
}
