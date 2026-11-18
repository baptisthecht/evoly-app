import { redirect } from "next/navigation";
import { completeMollieConnection } from "@/server/mollieConnect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adresse de retour de l'application Mollie Connect (docs/MOLLIE.md) : fin de la liaison du compte Mollie. */
export async function GET(req: Request) {
  redirect(await completeMollieConnection(new URL(req.url).searchParams));
}
