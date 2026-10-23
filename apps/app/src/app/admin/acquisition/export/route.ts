import { csvSafe } from "@/lib/csv";
import { offlineConversions } from "@/server/acquisitionReport";
import { requireStaff } from "@/server/platform";

/** Heure de Bruxelles au format attendu par Google Ads (« yyyy-MM-dd HH:mm:ss »). */
const brussels = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Brussels",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);

/** Conversions hors ligne à importer dans Google Ads : seulement les clics publicitaires acceptés par l'internaute. */
export async function GET(req: Request) {
  await requireStaff("SUPPORT");
  const days = Math.min(
    90,
    Math.max(1, Number(new URL(req.url).searchParams.get("jours")) || 90),
  ); // Google n'accepte que 90 jours
  const rows = await offlineConversions(
    new Date(Date.now() - days * 86_400_000),
  );
  const lines = [
    "Parameters:TimeZone=Europe/Brussels",
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
  ];
  for (const r of rows)
    lines.push(
      [r.gclid, r.name, brussels(r.at), "", "EUR"].map(csvSafe).join(","),
    );
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="conversions-google-ads.csv"',
      "cache-control": "no-store",
    },
  });
}
