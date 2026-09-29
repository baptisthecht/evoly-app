import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { OnboardingStripeStep } from "@/components/auth/OnboardingStripeStep";

export default async function OnboardingStripePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { select: { id: true, slug: true, stripeAccountStatus: true } } },
  });

  if (!membership) redirect("/onboarding/profile");

  const org = membership.organization;

  // If already connected, skip to dashboard
  if (org.stripeAccountStatus === "ACTIVE") {
    redirect(`/dashboard/${org.slug}`);
  }

  return (
    <div className="space-y-6">
      {/* Steps indicator */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-medium">✓</span>
            Votre organisation
          </span>
          <span className="flex-1 h-px bg-gray-200" />
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center font-medium">✓</span>
            Activité
          </span>
          <span className="flex-1 h-px bg-gray-200" />
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-medium">3</span>
            Compte bancaire
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-violet-600 rounded-full" style={{ width: "100%" }} />
        </div>
      </div>

      <OnboardingStripeStep
        organizationId={org.id}
        orgSlug={org.slug}
        stripeStatus={org.stripeAccountStatus}
      />
    </div>
  );
}
