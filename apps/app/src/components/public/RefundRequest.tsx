"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestRefundAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { Button } from "../ui/Button";

/** US-REF-01 : demande de remboursement de tout ou partie des billets, selon la politique de l'événement. */
export function RefundRequest({ token, tickets, automatic, outOfDeadline, policyText }: { token: string; tickets: Array<{ id: string; label: string }>; automatic: boolean; outOfDeadline: boolean; policyText: string }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(tickets.length === 1 ? [tickets[0]!.id] : []);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <div className="grid justify-items-center gap-1 text-center">
        <p className="text-sm text-ink-muted">{policyText}</p>
        <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => setOpen(true)}>
          {t("refundRequest")}
        </button>
      </div>
    );
  return (
    <section className="grid gap-4 rounded-[var(--r-panel)] bg-surface-raised p-5 ring-1 ring-line" aria-labelledby="refund-title">
      <h2 id="refund-title" className="font-display text-xl tracking-[-0.03em]">
        {t("refundRequest")}
      </h2>
      <p className="text-sm">{automatic ? t("refundAutomatic") : outOfDeadline ? t("refundOutOfDeadline") : t("refundReviewed")}</p>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("refundWhich")}</legend>
        {tickets.map((tk) => (
          <label key={tk.id} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={selected.includes(tk.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, tk.id] : s.filter((x) => x !== tk.id)))} className="size-5 accent-[var(--ink)]" />
            {tk.label}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1 text-sm font-semibold">
        {t("refundMessage")}
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} className="block w-full rounded-md bg-surface-raised px-4 py-3 font-normal shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]" />
      </label>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="dark"
          disabled={busy || selected.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await requestRefundAction(token, selected, message);
            setBusy(false);
            if (!res.ok) return setError(t.has(`error_${res.error}`) ? t(`error_${res.error}`) : t("error_UNKNOWN"));
            router.refresh();
          }}
        >
          {automatic ? t("refundSubmitAuto") : t("refundSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </section>
  );
}
