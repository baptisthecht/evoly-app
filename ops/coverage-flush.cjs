// écrit la couverture de V8 avant de quitter sur un signal d arrêt (sinon Node ne l écrit qu à une sortie normale)
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    try {
      require("node:v8").takeCoverage();
    } catch {}
    process.exit(0);
  });
}
