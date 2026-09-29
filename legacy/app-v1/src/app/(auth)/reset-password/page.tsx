import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import Link from "next/link";
import { db } from "@evoly/db";

export const metadata: Metadata = {
  title: "Nouveau mot de passe — Evoly",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Lien invalide</h1>
        <p className="text-sm text-gray-500 mb-4">Ce lien est invalide.</p>
        <Link href="/forgot-password" className="text-violet-600 text-sm hover:underline">
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  // Validate token before showing form
  const record = await db.verificationToken.findUnique({ where: { token } });
  const isValid = record && record.identifier.startsWith("reset:") && record.expires > new Date();

  if (!isValid) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Lien expiré</h1>
        <p className="text-sm text-gray-500 mb-4">
          Ce lien a expiré ou est invalide.
        </p>
        <Link
          href="/forgot-password"
          className="text-violet-600 text-sm hover:underline"
        >
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        Nouveau mot de passe
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Choisissez un mot de passe de minimum 8 caractères.
      </p>
      <ResetPasswordForm token={token} />
    </div>
  );
}
