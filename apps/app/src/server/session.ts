import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

/** Session de la requête en cours (mise en cache pour la durée du rendu). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Utilisateur connecté et vérifié, sinon redirection (RG-AUTH-01, RG-AUTH-03). */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.emailVerified) redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`);
  // US-AUTH-06 : double authentification activée → code exigé pour cette session
  const { db } = await import("@/lib/db");
  const { twoFactorSatisfied } = await import("./twoFactor");
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, twoFactorEnabled: true } });
  if (u && !(await twoFactorSatisfied(u, session.session.id))) redirect("/2fa");
  return session;
}
