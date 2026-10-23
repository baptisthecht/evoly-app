"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import type { ImportReport } from "@/server/externalImport";
import type { ColumnMap, ImportField } from "@/server/importFile";

const FIELDS: ImportField[] = [
  "code",
  "reservation",
  "firstName",
  "lastName",
  "fullName",
  "tarif",
  "price",
  "row",
  "seat",
  "quantity",
];

/** Import des billets d'un réseau en 1 clic ; colonnes demandées seulement si elles ne sont pas sûres (docs/COMPATIBILITE_RESEAUX.md). */
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
  const [file, setFile] = useState<File | null>(null); // gardé : rien à redéposer après le choix des colonnes
  const [fullFile, setFullFile] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [columns, setColumns] = useState<Record<number, ImportField | "">>({});
  const [header, setHeader] = useState(true);

  const send = async (mapping?: ColumnMap) => {
    if (!file) return;
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("distributorId", distributorId);
    if (fullFile) body.set("fullFile", "1");
    if (mapping) {
      body.set("mapping", JSON.stringify(mapping));
      body.set("header", header ? "1" : "0");
    }
    try {
      const res = await fetch(
        `/o/${orgSlug}/events/${eventId}/distribution/import`,
        { method: "POST", body },
      );
      const json = (await res.json().catch(() => ({}))) as {
        report?: ImportReport;
        error?: string;
      };
      if (!json.report) setError(json.error ?? "UNKNOWN");
      else {
        setReport(json.report);
        if (json.report.needsMapping)
          setColumns(
            Object.fromEntries(
              Object.entries(json.report.needsMapping.guess).map(([f, i]) => [
                i,
                f as ImportField,
              ]),
            ),
          );
        else router.refresh();
      }
    } catch {
      setError("NETWORK");
    } finally {
      setPending(false);
    }
  };
  const confirmColumns = () => {
    const mapping: ColumnMap = {};
    for (const [i, f] of Object.entries(columns)) if (f) mapping[f] = Number(i);
    void send(mapping);
  };

  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("importOpen")}
      </Button>
    );
  const needs = report?.needsMapping;
  return (
    <div className="grid w-full gap-4 rounded-md bg-surface p-4">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setReport(null);
          void send();
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
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={fullFile}
            onChange={(e) => setFullFile(e.target.checked)}
            className="mt-1"
          />
          <span>{t("importFullFile")}</span>
        </label>
        <div>
          <Button type="submit" disabled={!file || pending}>
            {pending ? t("importPending") : t("importSubmit")}
          </Button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {te.has(error) ? te(error) : t("importError")}
        </p>
      ) : null}
      {needs ? (
        <div className="grid gap-3">
          <p className="text-sm">{t("mappingIntro")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {needs.headers.map((h, i) => (
                    <th key={i} scope="col" className="min-w-36 p-2 align-top">
                      <span className="block truncate font-semibold">
                        {h || t("mappingColumn", { n: i + 1 })}
                      </span>
                      <Select
                        aria-label={t("mappingFor", {
                          column: h || String(i + 1),
                        })}
                        value={columns[i] ?? ""}
                        onChange={(e) =>
                          setColumns((c) => ({
                            ...c,
                            [i]: e.target.value as ImportField | "",
                          }))
                        }
                      >
                        <option value="">{t("mappingIgnore")}</option>
                        {FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {t(`field_${f}`)}
                          </option>
                        ))}
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {needs.sample.map((r, k) => (
                  <tr key={k} className="border-t border-line">
                    {needs.headers.map((_, i) => (
                      <td key={i} className="p-2 text-ink-muted">
                        {r[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={header}
              onChange={(e) => setHeader(e.target.checked)}
            />
            {t("mappingHeader")}
          </label>
          <div>
            <Button
              type="button"
              disabled={
                pending ||
                !Object.values(columns).some(
                  (f) => f === "code" || f === "reservation",
                )
              }
              onClick={confirmColumns}
            >
              {t("mappingSubmit")}
            </Button>
          </div>
        </div>
      ) : null}
      {report && !needs ? <ImportSummary report={report} /> : null}
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
