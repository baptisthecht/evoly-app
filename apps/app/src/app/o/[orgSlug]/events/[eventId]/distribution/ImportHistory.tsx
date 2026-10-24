"use client";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/forms";
import { deleteImportBatchAction } from "../../actions";

export interface ImportBatchRow {
  id: string;
  distributor: string;
  fileName: string;
  createdAt: string;
  createdBy: string | null;
  status: "IMPORTED" | "DELETED";
  created: number;
  deletedAt: string | null;
  deletedCount: number | null;
  keptEntered: number | null;
}

/** Historique des imports d'un événement ; un import se supprime (billets déjà entrés gardés). */
export function ImportHistory({
  orgSlug,
  eventId,
  batches,
}: {
  orgSlug: string;
  eventId: string;
  batches: ImportBatchRow[];
}) {
  const t = useTranslations("distribution");
  const locale = useLocale();
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  return (
    <ul className="grid gap-3">
      {batches.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-sunken p-4"
        >
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-semibold">
              {t("historyLine", { file: b.fileName, network: b.distributor })}
            </span>
            <span className="text-sm text-ink-muted">
              {b.createdBy
                ? t("historyMeta", {
                    date: date(b.createdAt),
                    author: b.createdBy,
                  })
                : date(b.createdAt)}
              {" · "}
              {t("historyCreated", { count: b.created })}
            </span>
            {b.status === "DELETED" && b.deletedAt ? (
              <span className="text-sm text-ink-muted">
                {t("historyDeletedOn", {
                  date: date(b.deletedAt),
                  deleted: b.deletedCount ?? 0,
                  kept: b.keptEntered ?? 0,
                })}
              </span>
            ) : null}
          </div>
          {b.status === "IMPORTED" ? (
            <DeleteImport orgSlug={orgSlug} eventId={eventId} batchId={b.id} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DeleteImport({
  orgSlug,
  eventId,
  batchId,
}: {
  orgSlug: string;
  eventId: string;
  batchId: string;
}) {
  const t = useTranslations("distribution");
  const [state, action, pending] = useActionState(
    deleteImportBatchAction.bind(null, orgSlug, eventId, batchId),
    null,
  );
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("historyDeleteConfirm"))) e.preventDefault();
      }}
      className="grid justify-items-start gap-1"
    >
      <SubmitButton pending={pending} variant="secondary">
        {t("historyDelete")}
      </SubmitButton>
      <FormError state={state} />
      {state?.ok ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("historyDeleted", {
            deleted: state.data.deleted,
            kept: state.data.keptEntered,
          })}
        </p>
      ) : null}
    </form>
  );
}
