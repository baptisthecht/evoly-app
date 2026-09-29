import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/server/session";

/** Point d'entrée : dernière organisation ouverte, sinon la première, sinon l'onboarding (RG-AUTH-07). */
export default async function Index() {
  const session = await requireUser();
  const memberships = await db.organizationMember.findMany({
    where: { userId: session.user.id, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
    select: { organizationId: true, organization: { select: { slug: true } } },
    orderBy: { joinedAt: "asc" },
  });
  if (memberships.length === 0) redirect("/onboarding");
  const activeId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  const active = memberships.find((m) => m.organizationId === activeId) ?? memberships[0]!;
  redirect(`/o/${active.organization.slug}`);
}
