import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { BrandForm } from "@/components/settings/BrandForm";
import Link from "next/link";

export default async function BrandPage({
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
      name: true,
      planId: true,
      subscriptionStatus: true,
      brand: true,
    },
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
  if (!membership?.role.permissions.includes("SETTINGS_EDIT")) {
    redirect(`/dashboard/${orgSlug}`);
  }

  const isPro = org.planId === "pro";

  return (
    <div className="p-6 max-w-2xl">
      {/* Settings nav tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <Link
          href={`/dashboard/${orgSlug}/settings`}
          className="pb-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
        >
          Général
        </Link>
        <Link
          href={`/dashboard/${orgSlug}/settings/brand`}
          className="pb-2 text-sm font-medium border-b-2 border-violet-600 text-violet-600 ml-4"
        >
          Brand & Identité {!isPro && <span className="ml-1 text-xs text-violet-500">Pro</span>}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Brand & Identité</h1>
      <p className="text-gray-500 text-sm mb-6">
        Personnalisez l'apparence de vos pages événements et emails.{" "}
        {!isPro && (
          <span className="text-violet-600 font-medium">
            Fonctionnalité réservée au plan Pro.
          </span>
        )}
      </p>

      <BrandForm
        organizationId={org.id}
        orgSlug={org.slug}
        isPro={isPro}
        brand={org.brand}
      />
    </div>
  );
}
