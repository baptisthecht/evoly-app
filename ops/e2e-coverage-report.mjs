import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import MCR from "monocart-coverage-reports";

const app = process.env.APP_DIR;
const kind = process.argv[2]; // "client" ou "server"
const norm = (p) =>
  p
    .replace(/\\/g, "/")
    .replace(/^.*?\[project\]\//, "")
    .replace(/^.*?(apps\/app\/src\/)/, "$1");
const mcr = MCR({
  name: `Parcours complets (${kind})`,
  outputDir: `${process.env.OUT_DIR}/${kind}`,
  reports: ["console-summary", "json-summary"],
  cleanCache: true,
  sourcePath: (p) => norm(p),
  // vrais fichiers sources seulement (pas les scripts intégrés aux pages, ni les tests)
  sourceFilter: (p) =>
    norm(p).startsWith("apps/app/src/") &&
    /\.(tsx?|jsx?|mjs)$/.test(norm(p)) &&
    !/\.(test|spec)\./.test(p),
  entryFilter: (e) =>
    kind === "client"
      ? e.url.includes("/_next/static/")
      : e.url.includes("/.next/server/"),
});
if (kind === "client") {
  const byUrl = new Map();
  for (const f of readdirSync(process.env.CLIENT_DIR)) {
    for (const e of JSON.parse(
      readFileSync(path.join(process.env.CLIENT_DIR, f), "utf8"),
    )) {
      // même script quel que soit le sous-domaine de la billetterie : une seule adresse, pour qu'il soit relié à ses sources
      e.url = `http://localhost:3001${new URL(e.url).pathname}`;
      const file = path.join(
        app,
        ".next",
        new URL(e.url).pathname.replace(/^\/_next\//, ""),
      );
      // Turbopack nomme la carte autrement que le script : son nom est dans la dernière ligne du script
      const ref = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(e.source ?? "")?.[1];
      const map = ref ? path.join(path.dirname(file), ref) : `${file}.map`;
      if (existsSync(map)) e.sourceMap = JSON.parse(readFileSync(map, "utf8"));
      const list = byUrl.get(e.url) ?? [];
      list.push(e);
      byUrl.set(e.url, list);
    }
  }
  for (const list of byUrl.values()) await mcr.add(list);
  console.log("scripts distincts :", byUrl.size);
} else {
  await mcr.addFromDir(process.env.SERVER_DIR);
}
await mcr.generate();
// totaux limités aux sources de l'application : les fichiers construits sans carte (entrées des pages) sont écartés
const summary = JSON.parse(
  readFileSync(`${process.env.OUT_DIR}/${kind}/coverage-summary.json`, "utf8"),
);
const own = Object.entries(summary).filter(
  ([k]) =>
    k !== "total" &&
    k.includes("apps/app/src/") &&
    /\.(tsx?|jsx?|mjs)$/.test(k),
);
const totals = Object.fromEntries(
  ["statements", "branches", "functions", "lines"].map((m) => {
    const covered = own.reduce((n, [, v]) => n + (v[m]?.covered ?? 0), 0);
    const total = own.reduce((n, [, v]) => n + (v[m]?.total ?? 0), 0);
    return [
      m,
      {
        covered,
        total,
        pct: total ? Math.round((1000 * covered) / total) / 10 : 0,
      },
    ];
  }),
);
console.log(
  `Sources de l'application (${kind}, ${own.length} fichiers) :`,
  JSON.stringify(totals),
);
