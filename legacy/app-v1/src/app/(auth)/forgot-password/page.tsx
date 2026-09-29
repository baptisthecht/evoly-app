import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mot de passe oublié — Evoly",
};

export default function ForgotPasswordPage() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        Mot de passe oublié
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Entrez votre email et nous vous enverrons un lien de réinitialisation.
      </p>
      <ForgotPasswordForm />
      <p className="text-center mt-4">
        <Link href="/login" className="text-sm text-violet-600 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
