import { hasFeature, sheetSlots, SHEET_PRESETS } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/server/context";
import { kitPreview, LABEL_MODELS, parseKitOptions, type KitOptions } from "@/server/seatLabels";

const field = "h-11 rounded-xl bg-surface-sunken px-3";

/** Kit d'installation de salle (section 9.33) : formats, modèles, options, aperçu de la première feuille et téléchargements. */
export default async function SeatLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const base = `/o/${orgSlug}/events/${eventId}`;
  if (!hasFeature(ctx.features, "SEATING_MAPS")) redirect(`${base}/seating`); // réservé au Pro : la page du plan présente l'offre
  const t = await getTranslations("seatKit");
  const q = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])));
  let opts: KitOptions;
  let gridError = false;
  try {
    opts = parseKitOptions(q);
  } catch {
    gridError = true;
    opts = parseKitOptions(new URLSearchParams());
  }
  const kit = await kitPreview(ctx, eventId, opts);
  const slots = sheetSlots(opts.format);
  const band = opts.model === "zone" || opts.model === "classique";
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl tracking-[-0.03em]">{t("pageTitle")}</h1>
        <p className="max-w-3xl text-ink-muted">{t("intro")}</p>
      </header>
      {gridError ? (
        <p role="alert" className="rounded-2xl p-4 text-sm font-semibold text-danger ring-1 ring-danger">
          {t("invalidGrid")}
        </p>
      ) : null}
      {kit.seats.length === 0 ? <p className="text-ink-muted">{t("noSeats")}</p> : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form method="get" className="grid content-start gap-5">
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-semibold">{t("formatLabel")}</legend>
            <select name="format" defaultValue={opts.formatId} aria-label={t("formatLabel")} className={field}>
              {[...Object.keys(SHEET_PRESETS), "personnalise"].map((id) => (
                <option key={id} value={id}>
                  {t(`format_${id.replace("-", "_")}`)}
                </option>
              ))}
            </select>
            <p className="text-sm text-ink-muted">{t("customHint")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  ["colonnes", "columns", opts.format.columns],
                  ["lignes", "rows", opts.format.rows],
                  ["margeHaut", "marginTop", opts.format.marginTop],
                  ["margeGauche", "marginLeft", opts.format.marginLeft],
                  ["espaceX", "gapX", opts.format.gapX],
                  ["espaceY", "gapY", opts.format.gapY],
                ] as const
              ).map(([name, key, value]) => (
                <label key={name} className="grid gap-1 text-sm">
                  {t(key)}
                  <input name={name} type="number" step="0.1" min="0" defaultValue={value} className={field} />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-semibold">{t("modelLabel")}</legend>
            {LABEL_MODELS.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="modele" value={m} defaultChecked={opts.model === m} className="size-5" />
                {t(`model_${m}`)}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <input id="evenement" type="checkbox" name="evenement" value="1" defaultChecked={opts.showEvent} className="peer size-5" />
              <label htmlFor="evenement">{t("showEvent")}</label>
              <p className="hidden basis-full text-sm font-semibold text-danger peer-checked:block">{t("showEventWarning")}</p>
            </div>
            <p className="text-sm text-ink-muted">{t("reusableHint")}</p>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-semibold">{t("selection")}</legend>
            <select name="bloc" defaultValue={opts.blockId ?? ""} aria-label={t("block")} className={field}>
              <option value="">{t("allBlocks")}</option>
              {kit.choices.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select name="rang" defaultValue={opts.rowId ?? ""} aria-label={t("rowChoice")} className={field}>
              <option value="">{t("allRows")}</option>
              {kit.choices.map((b) => (
                <optgroup key={b.id} label={b.name}>
                  {b.rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {t("row")} {r.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </fieldset>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-1 font-semibold">{t("zoneShape")}</legend>
            {(["rond", "rectangle"] as const).map((z) => (
              <label key={z} className="flex items-center gap-2">
                <input type="radio" name="zones" value={z} defaultChecked={opts.zoneShape === z} className="size-5" />
                {t(`zone_${z}`)}
              </label>
            ))}
          </fieldset>
          <p className="rounded-xl bg-surface-sunken p-3 text-sm font-semibold">{t("printHint")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="h-11 rounded-full px-5 font-semibold ring-1 ring-current">
              {t("refresh")}
            </button>
            {(
              [
                ["etiquettes.pdf", "downloadLabels"],
                ["guide-de-pose.pdf", "downloadGuide"],
                ["page-test.pdf", "downloadTest"],
              ] as const
            ).map(([file, label]) => (
              <button
                key={file}
                type="submit"
                formAction={`${base}/${file}`}
                className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)]"
              >
                {t(label)}
              </button>
            ))}
          </div>
        </form>
        <section aria-label={t("preview")} className="grid content-start gap-2">
          <h2 className="font-semibold">{t("preview")}</h2>
          <p className="text-sm text-ink-muted">{t("summaryLine", { labels: kit.seats.length, sheets: kit.sheets })}</p>
          <svg viewBox="0 0 210 297" role="img" aria-label={t("preview")} className="w-full rounded-md bg-white shadow-md ring-1 ring-black/10">
            {slots.map((s, i) => (
              <rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.width}
                height={s.height}
                fill="none"
                stroke="var(--evoly-seat-outline)"
                strokeOpacity={0.6}
                strokeWidth="0.3"
                strokeDasharray={opts.format.cutMarks ? "1.5 1.5" : undefined}
              />
            ))}
            {kit.first?.slots.map(({ slot: s, seat }) => (
              <g key={seat.id}>
                {band ? (
                  <rect x={s.x} y={s.y} width={s.width} height={s.height * 0.2} fill={opts.model === "zone" ? seat.category.color : "var(--evoly-charbon)"} />
                ) : null}
                <text
                  x={s.x + s.width * 0.06}
                  y={s.y + s.height * (band ? 0.15 : 0.16)}
                  fontSize={Math.min(s.height * 0.1, 4.5)}
                  fontWeight="600"
                  fill={band && opts.model === "classique" ? "var(--evoly-blanc)" : "var(--evoly-plan-entrance)"}
                >
                  {seat.block.name.toUpperCase()}
                </text>
                <text x={s.x + s.width * 0.06} y={s.y + s.height * 0.82} fontSize={s.height * 0.42} fontWeight="900" fill="var(--evoly-charbon)">
                  {seat.row.name} {seat.label}
                </text>
              </g>
            ))}
          </svg>
        </section>
      </div>
    </div>
  );
}
