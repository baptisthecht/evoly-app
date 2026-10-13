import { currentStaff } from "@/server/platform";
import { getSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });

/**
 * Vérification faite par Caddy avant chaque requête vers pgAdmin (app.<domaine>/pgadmin, RG-ADM-01) : accès complet à la base
 * réservé aux administrateurs Evoly connectés, double authentification validée. Les autres sont renvoyés vers la connexion
 * ou la double authentification, ou reçoivent « introuvable », sans rien révéler de pgAdmin.
 */
export async function GET() {
  const st = await currentStaff();
  if (!st) return (await getSession()) ? new Response("Introuvable", { status: 404 }) : redirect("/login?next=%2Fpgadmin");
  if (!st.verified) return redirect("/admin/2fa");
  if (st.user.platformRole !== "ADMIN") return new Response("Accès réservé aux administrateurs", { status: 403 });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
