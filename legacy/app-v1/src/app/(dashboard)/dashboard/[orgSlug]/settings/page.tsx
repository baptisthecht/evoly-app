import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm";
import Link from "next/link";

export default async function SettingsPage({
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
      id: true, slug: true, name: true, description: true,
      email: true, timezone: true, type: true, logoUrl: true,
      planId: true, subscriptionStatus: true,
    },
  });
  if (!org) redirect("/dashboard");

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("SETTINGS_EDIT")) redirect(`/dashboard/${orgSlug}`);

  const hasActiveEvents = await db.event.count({
    where: { organizationId: org.id, status: "PUBLISHED" },
  });
  const hasActiveSubscription =
    org.subscriptionStatus === "ACTIVE" || org.subscriptionStatus === "TRIALING";

  return (
    <div className="p-6 max-w-lg">
      {/* Settings nav tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <Link
          href={`/dashboard/${orgSlug}/settings`}
          className="pb-2 text-sm font-medium border-b-2 border-violet-600 text-violet-600"
        >
          Général
        </Link>
        <Link
          href={`/dashboard/${orgSlug}/settings/brand`}
          className="pb-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 ml-4"
        >
          Brand & Identité {org.planId !== "pro" && <span className="ml-1 text-xs text-violet-500">Pro</span>}
        </Link>
      </div>
      <OrgSettingsForm
        org={{
          id: org.id,
          slug: org.slug,
          name: org.name,
          description: org.description,
          email: org.email,
          timezone: org.timezone,
          type: org.type,
          logoUrl: org.logoUrl,
        }}
        canDelete={!hasActiveEvents && !hasActiveSubscription}
        deleteBlockReason={
          hasActiveSubscription
            ? "Annulez votre abonnement Pro avant de supprimer l'organisation."
            : hasActiveEvents
            ? "Dépubliez ou annulez vos événements actifs avant de supprimer l'organisation."
            : null
        }
      />
    </div>
  );
}
