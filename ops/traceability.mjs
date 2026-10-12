// Traçabilité du cahier des charges (docs/MAINTENANCE.md) : pour chaque règle RG-…, est-elle citée dans le code, dans un test ?
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ids = [...new Set(readFileSync("docs/CDC.md", "utf8").match(/\bRG-[A-Z]+-\d+\b/g) ?? [])].sort();
const cited = (paths) => {
  try {
    return new Set(
      execFileSync("grep", ["-rhoE", "RG-[A-Z]+-[0-9]+", ...paths, "--include=*.ts", "--include=*.tsx"], { encoding: "utf8" })
        .split("\n")
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
};
const code = cited(["apps/app/src", "packages/core/src", "packages/i18n/src"]);
const tests = cited(["apps/app/test", "packages/core/test", "apps/app/e2e"]);
const nowhere = ids.filter((i) => !code.has(i) && !tests.has(i));
const untested = ids.filter((i) => !tests.has(i));
console.log(
  `Cahier des charges : ${ids.length} règles · citées dans le code : ${ids.filter((i) => code.has(i)).length} · citées dans un test : ${ids.length - untested.length}`,
);
console.log(`Citées dans aucun test (${untested.length}) : ${untested.join(" ")}`);
console.log(`Citées nulle part (${nowhere.length}) : ${nowhere.join(" ")}`);
