"use client";

import type { EmailDoc } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { previewDraftAction } from "@/app/o/[orgSlug]/marketing/campaigns/actions";

/**
 * Aperçu en temps réel : rendu par le serveur, avec exactement le code de l'envoi (nettoyage du HTML compris),
 * à chaque modification, sans rien enregistrer. Affiché dans un cadre isolé où aucun script ne peut s'exécuter.
 */
export function EmailPreview({ orgSlug, subject, previewText, content }: { orgSlug: string; subject: string; previewText: string; content: EmailDoc }) {
  const t = useTranslations("emailEditor");
  const [mail, setMail] = useState<{ html: string; subject: string; warnings: string[] } | null>(null);
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const seq = useRef(0);
  const input = JSON.stringify({ subject, previewText, content });
  useEffect(() => {
    const n = ++seq.current;
    const h = setTimeout(async () => {
      const r = await previewDraftAction(orgSlug, JSON.parse(input) as unknown);
      if (n === seq.current && r?.ok) setMail(r.data);
    }, 300);
    return () => clearTimeout(h);
  }, [orgSlug, input]);
  return (
    <section className="grid content-start gap-3" aria-label={t("preview")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("preview")}</h3>
        <div role="group" aria-label={t("preview")} className="flex gap-1 rounded-full bg-surface-sunken p-1">
          {(["desktop", "mobile"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`h-9 rounded-full px-4 text-sm font-semibold ${mode === m ? "bg-surface-raised shadow-sm" : "text-ink-muted"}`}
            >
              {t(m)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-0.5 rounded-lg bg-surface-raised p-3 ring-1 ring-line">
        <span className="text-xs text-ink-muted">{t("inbox")}</span>
        <span className="truncate font-semibold">{mail?.subject || subject || t("noSubject")}</span>
        {previewText && <span className="truncate text-sm text-ink-muted">{previewText}</span>}
      </div>
      {mail && mail.warnings.length > 0 && (
        <p role="status" className="rounded-md bg-surface-sunken p-3 text-sm">
          {t("warnings")} {mail.warnings.map((w) => t(`warn_${w}` as "warn_SCRIPT")).join(", ")}.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg bg-surface-sunken p-3">
        <iframe
          title={t("previewFrame")}
          sandbox=""
          srcDoc={mail?.html ?? ""}
          className="mx-auto block h-[680px] max-w-none rounded-md bg-white"
          style={{ width: mode === "mobile" ? 375 : "100%" }}
        />
      </div>
    </section>
  );
}
