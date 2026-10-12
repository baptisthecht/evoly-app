// Vérification hebdomadaire des versions (docs/MAINTENANCE.md) : pour chaque dépendance en retard, la version la plus récente publiée
// depuis 14 jours au moins (une version piégée est en général repérée et retirée dans ce délai), classée en mineure (à appliquer)
// ou majeure (à migrer à part). Les versions candidates (alpha, beta, rc) sont ignorées.
import { execFileSync } from "node:child_process";

const MIN_AGE_DAYS = 14;
const now = Date.now();
let outdated = {};
try {
  outdated = JSON.parse(execFileSync("pnpm", ["outdated", "-r", "--format", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) || "{}");
} catch (err) {
  outdated = JSON.parse(err.stdout || "{}"); // pnpm outdated sort avec le code 1 quand il y a des mises à jour
}
const major = (v) => Number(String(v).split(".")[0]);
const safe = [];
const majors = [];
const tooRecent = [];
for (const [name, info] of Object.entries(outdated)) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (!res.ok) continue;
  const meta = await res.json();
  const stable = Object.keys(meta.versions ?? {}).filter((v) => !v.includes("-") && meta.time?.[v]);
  const oldEnough = (v) => (now - new Date(meta.time[v]).getTime()) / 86_400_000 >= MIN_AGE_DAYS;
  const newest = (list) => list.sort((a, b) => new Date(meta.time[a]) - new Date(meta.time[b])).at(-1);
  const sameMajor = newest(stable.filter((v) => major(v) === major(info.current) && oldEnough(v)));
  const nextMajor = newest(stable.filter((v) => major(v) > major(info.current) && oldEnough(v)));
  if (sameMajor && sameMajor !== info.current) safe.push(`${name} ${info.current} → ${sameMajor}`);
  if (nextMajor) majors.push(`${name} ${info.current} → ${nextMajor}`);
  if (!sameMajor || sameMajor === info.current) if (!nextMajor && info.latest !== info.current) tooRecent.push(`${name} ${info.latest}`);
}
const show = (title, list) => console.log(`${title} : ${list.length ? `\n  - ${list.join("\n  - ")}` : "aucune"}`);
show("Mises à jour mineures sûres (à appliquer, puis tous les tests)", safe);
show("Versions majeures disponibles (à migrer une par une)", majors);
show(`Versions trop récentes (moins de ${MIN_AGE_DAYS} jours, à revoir la semaine prochaine)`, tooRecent);
