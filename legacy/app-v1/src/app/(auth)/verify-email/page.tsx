import type { Metadata } from "next";
import { verifyEmailAction } from "@/actions/auth";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vérification email — Evoly",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Lien invalide</h1>
        <p className="text-sm text-gray-500 mb-4">
          Ce lien de vérification est invalide ou manquant.
        </p>
        <Link href="/login" className="text-violet-600 text-sm hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  const result = await verifyEmailAction(token);

  if (result.error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          Vérification échouée
        </h1>
        <p className="text-sm text-gray-500 mb-4">{result.error}</p>
        <Link href="/login" className="text-violet-600 text-sm hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-gray-900 mb-2">
        Email vérifié !
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Votre adresse email a bien été vérifiée. Vous pouvez maintenant vous
        connecter.
      </p>
      <Link
        href="/login"
        className="inline-flex items-center justify-center px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
      >
        Se connecter
      </Link>
    </div>
  );
}
