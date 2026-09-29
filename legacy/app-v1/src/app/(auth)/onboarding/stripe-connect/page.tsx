import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OnboardingStripeConnectPage() {
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
            <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 text-xs flex items-center justify-center font-medium">✓</span>
            Type d&apos;activité
          </span>
          <span className="flex-1 h-px bg-violet-200" />
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-medium">3</span>
            Paiements
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Connecter votre compte bancaire
            </h1>
            <p className="text-sm text-gray-500">Via Stripe — sécurisé et certifié</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <strong>Obligatoire uniquement pour les tickets payants.</strong> Vous
            pouvez ignorer cette étape et créer des événements gratuits
            immédiatement.
          </p>
        </div>

        <ul className="space-y-2 mb-6">
          {[
            "Vos revenus sont virés directement sur votre compte bancaire",
            "Commission Evoly prélevée automatiquement à la source",
            "Stripe gère la sécurité et la conformité PCI DSS",
            "Configuration en moins de 5 minutes",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <a
            href="/dashboard"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Connecter mon compte bancaire
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
          <a
            href="/dashboard"
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Passer cette étape — je ferai ça plus tard
          </a>
        </div>
      </div>
    </div>
  );
}
