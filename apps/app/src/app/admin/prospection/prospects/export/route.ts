import { requireStaff } from "@/server/platform";
import { prospectsCsv } from "@/server/prospection";

export const dynamic = "force-dynamic";

/** Export des prospects en CSV (Excel), réservé aux administrateurs. */
export async function GET() {
  await requireStaff("ADMIN");
  const jour = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
  }).format(new Date());
  return new Response(await prospectsCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prospects-evoly-${jour}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
