import { db } from "@evoly/db";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { acceptInvitationAction } from "@/actions/members";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  const invitation = await db.invitation.findUnique({
    where: { token },
    include: { organization: { select: { name: true, logoUrl: true } } },
  });

  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm text-center space-y-3">
          <p className="text-3xl">⚠️</p>
          <h1 className="font-semibold text-gray-900">Invitation invalide</h1>
          <p className="text-sm text-gray-500">
            Cette invitation est introuvable, expirée ou déjà utilisée.
          </p>
          <a href="/" className="text-sm text-violet-600 hover:underline">Retour à l'accueil</a>
        </div>
      </div>
    );
  }

  // If user is logged in with wrong email, show error
  if (session?.user && session.user.email !== invitation.email) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm text-center space-y-3">
          <p className="text-3xl">🔑</p>
          <h1 className="font-semibold text-gray-900">Mauvais compte</h1>
          <p className="text-sm text-gray-500">
            Cette invitation est destinée à <strong>{invitation.email}</strong>.<br />
            Vous êtes connecté avec <strong>{session.user.email}</strong>.
          </p>
          <a href="/login" className="text-sm text-violet-600 hover:underline">
            Se connecter avec le bon compte
          </a>
        </div>
      </div>
    );
  }

  // Not logged in → redirect to login with callbackUrl
  if (!session?.user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm text-center space-y-4">
          <p className="text-3xl">🎉</p>
          <h1 className="font-semibold text-gray-900">
            Rejoindre {invitation.organization.name}
          </h1>
          <p className="text-sm text-gray-500">
            Vous avez été invité(e) à rejoindre cette organisation sur Evoly.
          </p>
          <div className="flex flex-col gap-2">
            <a
              href={`/login?callbackUrl=/invite/${token}`}
              className="py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors text-center"
            >
              Se connecter pour accepter
            </a>
            <a
              href={`/register?invite=${token}&email=${encodeURIComponent(invitation.email)}`}
              className="py-2.5 border border-gray-300 text-sm text-gray-700 rounded-xl hover:bg-gray-50 text-center"
            >
              Créer un compte
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Auto-accept server-side and redirect
  const result = await acceptInvitationAction(token);
  if (result.success && result.orgSlug) {
    redirect(`/dashboard/${result.orgSlug}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm text-center space-y-3">
        <p className="text-3xl">❌</p>
        <h1 className="font-semibold text-gray-900">Erreur</h1>
        <p className="text-sm text-gray-500">{result.error ?? "Une erreur est survenue."}</p>
        <a href="/dashboard" className="text-sm text-violet-600 hover:underline">Dashboard</a>
      </div>
    </div>
  );
}
