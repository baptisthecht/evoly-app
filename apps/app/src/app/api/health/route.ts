import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Santé : configuration lisible (variables d'environnement) et base joignable. */
export async function GET() {
  try {
    env();
  } catch (err) {
    // noms des variables en cause seulement, jamais leurs valeurs
    const names = err && typeof err === "object" && "issues" in err ? (err as { issues: Array<{ path: PropertyKey[] }> }).issues.map((i) => i.path.join(".")) : [];
    console.error("configuration invalide :", names.join(", ") || "voir les variables d'environnement");
    return Response.json({ status: "config", variables: names }, { status: 503 });
  }
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
