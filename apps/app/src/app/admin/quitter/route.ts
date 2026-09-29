import { stopSupportView } from "@/server/platform";

export const dynamic = "force-dynamic";

/** Fin de la consultation support : retour au back-office. */
export async function GET(req: Request) {
  await stopSupportView();
  return Response.redirect(new URL("/admin", req.url), 303);
}
