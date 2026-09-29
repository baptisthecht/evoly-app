import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Créer un compte — Evoly",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; email?: string }>;
}) {
  const { invite, email } = await searchParams;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      {invite ? (
        <>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">
            Rejoindre l&apos;organisation
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Créez un compte pour accepter l&apos;invitation.{" "}
            <a href={`/login?callbackUrl=/invite/${invite}`} className="text-violet-600 hover:underline font-medium">
              Déjà un compte ? Se connecter
            </a>
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">
            Créer un compte
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Déjà un compte ?{" "}
            <a href="/login" className="text-violet-600 hover:underline font-medium">
              Se connecter
            </a>
          </p>
        </>
      )}
      <RegisterForm inviteToken={invite} prefillEmail={email} />
    </div>
  );
}
