import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { OnboardingStep1Form } from "@/components/auth/OnboardingStep1Form";

export default async function OnboardingProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Check if user already has an org → skip to dashboard
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  });

  if (membership) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      {/* Steps indicator */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-medium">1</span>
            Votre organisation
          </span>
          <span className="flex-1 h-px bg-gray-200" />
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-400 text-xs flex items-center justify-center font-medium">2</span>
            Type d&apos;activité
          </span>
          <span className="flex-1 h-px bg-gray-200" />
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-400 text-xs flex items-center justify-center font-medium">3</span>
            Paiements
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          Créez votre organisation
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          C&apos;est sous ce nom que vos événements seront publiés.
        </p>
        <OnboardingStep1Form userId={session.user.id} />
      </div>
    </div>
  );
}
