"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { IMPORT_FIELDS, type ImportField } from "@/lib/importFields";
import type { ImportReport, ImportWarning } from "@/server/externalImport";

/** Aperçu d'un fichier, renvoyé par la route d'import (étape de lecture). */
interface Preview {
  fileName: string;
  header: boolean;
  rowCount: number;
  totalRows: number;
  raw: string[][];
  proposal: Partial<Record<ImportField, number | null>>;
  remembered: boolean;
  warnings: ImportWarning[];
}
/** Colonne choisie, null : « absent de ce fichier », undefined : pas encore tranché. */
type Choice = number | null | undefined;

/**
 * Import des billets d'un réseau (docs/COMPATIBILITE_RESEAUX.md) : le fichier
 * est lu, Evoly propose les colonnes, et l'organisateur confirme chaque
 * information (une colonne, ou « Absent de ce fichier ») avant d'importer.
 */
export function ImportPanel({
  orgSlug,
  eventId,
  distributorId,
}: {
  orgSlug: string;
  eventId: string;
  distributorId: string;
}) {
  const t = useTranslations("distribution");
  const te = useTranslations("formErrors");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Partial<Record<ImportField, Choice>>>(
    {},
  );
  const [header, setHeader] = useState(true);
  const [fullFile, setFullFile] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const post = async (fields: Record<string, string>) => {
    if (!file) return null;
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("distributorId", distributorId);
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    try {
      const res = await fetch(
        `/o/${orgSlug}/events/${eventId}/distribution/import`,
        { method: "POST", body },
      );
      const json = (await res.json().catch(() => ({}))) as {
        preview?: Preview;
        report?: ImportReport;
        error?: string;
      };
      if (json.error || (!json.preview && !json.report))
        setError(json.error ?? "UNKNOWN");
      return json;
    } catch {
      setError("NETWORK");
      return null;
    } finally {
      setPending(false);
    }
  };
  const read = async () => {
    setReport(null);
    const json = await post({ step: "preview" });
    if (json?.preview) {
      setPreview(json.preview);
      setChoices(json.preview.proposal);
      setHeader(json.preview.header);
    }
  };
  const importNow = async () => {
    const mapping = Object.fromEntries(
      IMPORT_FIELDS.map((f) => [f, choices[f] ?? null]),
    );
    const json = await post({
      step: "import",
      mapping: JSON.stringify(mapping),
      header: header ? "1" : "0",
      ...(fullFile ? { fullFile: "1" } : {}),
    });
    if (json?.report) {
      setReport(json.report);
      setPreview(null);
      router.refresh();
    }
  };
  const reset = () => {
    setPreview(null);
    setReport(null);
    setFile(null);
    setChoices({});
    setError(null);
  };

  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("importOpen")}
      </Button>
    );

  const width = preview ? Math.max(0, ...preview.raw.map((r) => r.length)) : 0;
  const titles = preview && header ? preview.raw[0]! : [];
  const dataRows = preview
    ? (header ? preview.raw.slice(1) : preview.raw).slice(0, 5)
    : [];
  const columnLabel = (i: number) =>
    titles[i]?.trim()
      ? t("mappingColumnTitled", { n: i + 1, title: titles[i]!.trim() })
      : t("mappingColumn", { n: i + 1 });
  const remaining = IMPORT_FIELDS.filter(
    (f) => choices[f] === undefined,
  ).length;
  const hasKey =
    typeof choices.code === "number" || typeof choices.reservation === "number";
  const rows = preview ? preview.totalRows - (header ? 1 : 0) : 0;

  return (
    <div className="grid w-full gap-4 rounded-md bg-surface p-4">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {te.has(error) ? te(error) : t("importError")}
        </p>
      ) : null}

      {report ? (
        <>
          <ImportSummary report={report} />
          <div>
            <Button type="button" variant="secondary" onClick={reset}>
              {t("importAnother")}
            </Button>
          </div>
        </>
      ) : !preview ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void read();
          }}
        >
          <Field
            label={t("importFile")}
            htmlFor={`${id}-file`}
            hint={t("importFileHint")}
          >
            <input
              id={`${id}-file`}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </Field>
          <div>
            <Button type="submit" disabled={!file || pending}>
              {pending ? t("reading") : t("readFile")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1">
            <p className="font-semibold">{preview.fileName}</p>
            <p className="text-sm text-ink-muted">{t("mappingIntro")}</p>
            {preview.remembered ? (
              <p className="text-sm text-ink-muted">{t("mappingRemembered")}</p>
            ) : null}
          </div>
          {preview.warnings.length ? (
            <ul
              role="alert"
              className="grid gap-1 rounded-md bg-surface-sunken p-3 text-sm"
            >
              {preview.warnings.map((w) => (
                <li key={w}>{t(`warn_${w}`)}</li>
              ))}
            </ul>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={header}
              onChange={(e) => setHeader(e.target.checked)}
            />
            {t("mappingHeader")}
          </label>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("mappingPreview")}</caption>
              <thead>
                <tr>
                  {Array.from({ length: width }, (_, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="max-w-48 truncate p-2 font-semibold"
                    >
                      {columnLabel(i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((r, k) => (
                  <tr key={k} className="border-t border-line">
                    {Array.from({ length: width }, (_, i) => (
                      <td
                        key={i}
                        className="max-w-48 truncate p-2 text-ink-muted"
                      >
                        {r[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => {
              const c = choices[f];
              return (
                <fieldset
                  key={f}
                  className="grid gap-1.5 rounded-md bg-surface-sunken p-3"
                >
                  <legend className="sr-only">{t(`field_${f}`)}</legend>
                  <span aria-hidden="true" className="text-sm font-semibold">
                    {t(`field_${f}`)}
                  </span>
                  <Select
                    aria-label={t("mappingFieldColumn", {
                      field: t(`field_${f}`),
                    })}
                    value={typeof c === "number" ? String(c) : ""}
                    onChange={(e) =>
                      setChoices((x) => ({
                        ...x,
                        [f]:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">{t("mappingChoose")}</option>
                    {Array.from({ length: width }, (_, i) => (
                      <option key={i} value={i}>
                        {columnLabel(i)}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label={t("mappingAbsentFor", {
                        field: t(`field_${f}`),
                      })}
                      checked={c === null}
                      onChange={(e) =>
                        setChoices((x) => ({
                          ...x,
                          [f]: e.target.checked ? null : undefined,
                        }))
                      }
                    />
                    {t("mappingAbsent")}
                  </label>
                </fieldset>
              );
            })}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={fullFile}
              onChange={(e) => setFullFile(e.target.checked)}
              className="mt-1"
            />
            <span>{t("importFullFile")}</span>
          </label>
          <p role="status" className="text-sm text-ink-muted">
            {remaining > 0
              ? t("mappingRemaining", { count: remaining })
              : !hasKey
                ? t("mappingNeedKey")
                : t("mappingRows", { count: rows })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || remaining > 0 || !hasKey}
              onClick={() => void importNow()}
            >
              {pending ? t("importPending") : t("importSubmit")}
            </Button>
            <Button type="button" variant="secondary" onClick={reset}>
              {t("changeFile")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportSummary({ report }: { report: ImportReport }) {
  const t = useTranslations("distribution");
  return (
    <div role="status" className="grid gap-2 text-sm">
      <p className="font-semibold">
        {t("reportCounts", {
          created: report.created,
          updated: report.updated,
          unchanged: report.unchanged,
        })}
      </p>
      {report.cancelled || report.keptEntered ? (
        <p>
          {t("reportCancelled", {
            cancelled: report.cancelled,
            kept: report.keptEntered,
          })}
        </p>
      ) : null}
      {report.seatsSoldOnEvoly.length ? (
        <p role="alert" className="font-semibold text-danger">
          {t("reportDoubleSale", {
            seats: report.seatsSoldOnEvoly.map((s) => s.seat).join(", "),
          })}
        </p>
      ) : null}
      {report.overAllocation.map((o) => (
        <p key={o.ticketType}>
          {t("reportOverAllocation", {
            ticketType: o.ticketType,
            imported: o.imported,
            allocated: o.allocated,
          })}
        </p>
      ))}
      {report.withoutTarif ? (
        <p>{t("reportWithoutTarif", { count: report.withoutTarif })}</p>
      ) : null}
      {report.seatsNotFound ? (
        <p>{t("reportSeatsNotFound", { count: report.seatsNotFound })}</p>
      ) : null}
      {report.ignored.length ? (
        <details>
          <summary className="cursor-pointer">
            {t("reportIgnored", { count: report.ignored.length })}
          </summary>
          <ul className="mt-1 grid gap-0.5 text-ink-muted">
            {report.ignored.slice(0, 50).map((i) => (
              <li key={`${i.line}-${i.reason}`}>
                {t("reportIgnoredLine", {
                  line: i.line,
                  reason: t(`reason_${i.reason}`),
                })}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
