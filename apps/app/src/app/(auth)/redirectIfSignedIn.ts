import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/server/session";

/** Pages de connexion et d'inscription : un utilisateur déjà connecté est renvoyé vers son espace. */
export async function redirectIfSignedIn(): Promise<void> {
  const session = await getSession();
  if (session?.user.emailVerified) redirect("/");
}
