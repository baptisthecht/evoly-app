import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OnboardingStep2Form } from "@/components/auth/OnboardingStep2Form";

export default async function OnboardingActivityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6">
      {/* Steps indicator */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 text-xs flex items-center justify-center font-medium">✓</span>
            Votre organisation
          </span>
          <span className="flex-1 h-px bg-violet-200" />
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-medium">2</span>
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
          Type d&apos;activité
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Cela nous aide à personnaliser votre expérience.
        </p>
        <OnboardingStep2Form />
      </div>
    </div>
  );
}
