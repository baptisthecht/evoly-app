import { hasFeature, sheetSlots, SHEET_PRESETS } from "@evoly/core";
import { buttonClass } from "@/components/ui/Button";
import { ExampleNote, SectionTitle } from "@/components/ui/Controls";
import { FIELD_CONTROL_CLASS } from "@/components/ui/Field";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/server/context";
import {
  kitPreview,
  LABEL_MODELS,
  parseKitOptions,
  type KitOptions,
} from "@/server/seatLabels";

// refonte A3 : les champs de l'application (40 px, filet de 1 px, arrondi 8 px)
const field = FIELD_CONTROL_CLASS;
const legend = "mb-1.5 text-[13px] font-medium";

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
  const q = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v] as [string, string]] : [],
    ),
  );
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
      <header>
        <SectionTitle title={t("pageTitle")} className="mb-0.5" />
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
      </header>
      {gridError ? (
        <p
          role="alert"
          className="rounded-[8px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
        >
          {t("invalidGrid")}
        </p>
      ) : null}
      {kit.seats.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{t("noSeats")}</p>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form method="get" className="grid content-start gap-5">
          <fieldset className="grid gap-2">
            <legend className={legend}>{t("formatLabel")}</legend>
            <select
              name="format"
              defaultValue={opts.formatId}
              aria-label={t("formatLabel")}
              className={field}
            >
              {[...Object.keys(SHEET_PRESETS), "personnalise"].map((id) => (
                <option key={id} value={id}>
                  {t(`format_${id.replace("-", "_")}`)}
                </option>
              ))}
            </select>
            <p className="text-[12.5px] text-ink-muted">{t("customHint")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                <label
                  key={name}
                  className="grid gap-1.5 text-[13px] font-medium"
                >
                  {t(key)}
                  <input
                    name={name}
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={value}
                    className={field}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className={legend}>{t("modelLabel")}</legend>
            {LABEL_MODELS.map((m) => (
              <label key={m} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="modele"
                  value={m}
                  defaultChecked={opts.model === m}
                />
                {t(`model_${m}`)}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <input
                id="evenement"
                type="checkbox"
                name="evenement"
                value="1"
                defaultChecked={opts.showEvent}
                className="peer"
              />
              <label htmlFor="evenement">{t("showEvent")}</label>
              <p className="hidden basis-full text-[13px] font-medium text-danger peer-checked:block">
                {t("showEventWarning")}
              </p>
            </div>
            <p className="text-[12.5px] text-ink-muted">{t("reusableHint")}</p>
          </div>
          <fieldset className="grid gap-2">
            <legend className={legend}>{t("selection")}</legend>
            <select
              name="bloc"
              defaultValue={opts.blockId ?? ""}
              aria-label={t("block")}
              className={field}
            >
              <option value="">{t("allBlocks")}</option>
              {kit.choices.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              name="rang"
              defaultValue={opts.rowId ?? ""}
              aria-label={t("rowChoice")}
              className={field}
            >
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
            <legend className={legend}>{t("zoneShape")}</legend>
            {(["rond", "rectangle"] as const).map((z) => (
              <label key={z} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="zones"
                  value={z}
                  defaultChecked={opts.zoneShape === z}
                />
                {t(`zone_${z}`)}
              </label>
            ))}
          </fieldset>
          <ExampleNote>{t("printHint")}</ExampleNote>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass("secondary")}>
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
                className={buttonClass("primary")}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </form>
        <section aria-label={t("preview")} className="grid content-start gap-2">
          <h2 className="text-[14.5px] leading-[normal] font-semibold">
            {t("preview")}
          </h2>
          <p className="text-[13px] text-ink-muted">
            {t("summaryLine", { labels: kit.seats.length, sheets: kit.sheets })}
          </p>
          <svg
            viewBox="0 0 210 297"
            role="img"
            aria-label={t("preview")}
            className="w-full rounded-[8px] bg-white ring-1 ring-line-strong"
          >
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
                  <rect
                    x={s.x}
                    y={s.y}
                    width={s.width}
                    height={s.height * 0.2}
                    fill={
                      opts.model === "zone"
                        ? seat.category.color
                        : "var(--evoly-charbon)"
                    }
                  />
                ) : null}
                <text
                  x={s.x + s.width * 0.06}
                  y={s.y + s.height * (band ? 0.15 : 0.16)}
                  fontSize={Math.min(s.height * 0.1, 4.5)}
                  fontWeight="600"
                  fill={
                    band && opts.model === "classique"
                      ? "var(--evoly-blanc)"
                      : "var(--evoly-plan-entrance)"
                  }
                >
                  {seat.block.name.toUpperCase()}
                </text>
                <text
                  x={s.x + s.width * 0.06}
                  y={s.y + s.height * 0.82}
                  fontSize={s.height * 0.42}
                  fontWeight="900"
                  fill="var(--evoly-charbon)"
                >
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
