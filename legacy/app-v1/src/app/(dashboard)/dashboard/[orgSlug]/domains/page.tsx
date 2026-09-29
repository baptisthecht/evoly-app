import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { DomainsManager } from "@/components/domains/DomainsManager";

export default async function DomainsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      id: true,
      slug: true,
      planId: true,
      previousSubdomain: true,
      subdomainChangedAt: true,
    },
  });
  if (!org) redirect("/dashboard");

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("SETTINGS_EDIT")) redirect(`/dashboard/${orgSlug}`);

  const isPro = org.planId === "pro";

  const customDomains = await db.customDomain.findMany({
    where: { organizationId: org.id },
    include: { event: { select: { title: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="p-6 max-w-2xl">
      <DomainsManager
        org={{
          id: org.id,
          slug: org.slug,
          isPro,
          previousSubdomain: org.previousSubdomain,
          subdomainChangedAt: org.subdomainChangedAt?.toISOString() ?? null,
        }}
        customDomains={customDomains.map((d) => ({
          id: d.id,
          domain: d.domain,
          scope: d.scope,
          status: d.status,
          sslStatus: d.sslStatus,
          verifiedAt: d.verifiedAt?.toISOString() ?? null,
          lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
          eventTitle: d.event?.title ?? null,
          eventSlug: d.event?.slug ?? null,
        }))}
      />
    </div>
  );
}
