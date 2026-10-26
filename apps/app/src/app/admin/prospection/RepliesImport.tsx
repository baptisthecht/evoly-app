"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  applyRepliesAction,
  previewRepliesAction,
  type RepliesState,
} from "./actions";

const ACTIONS: Record<string, string> = {
  change: "Statut changé",
  note: "Note ajoutée",
  same: "Rien à faire",
  protected: "Protégé",
  unknown: "Adresse inconnue",
  invalid: "Ligne invalide",
};
const REASONS: Record<string, string> = {
  CLIENT: "déjà client, jamais rétrogradé",
  INSCRIT: "compte déjà créé, jamais rétrogradé",
  EXCLU: "ne plus contacter, le reste",
  EMAIL: "adresse invalide",
  STATUS: "statut non reconnu",
};

/** Réponses des prospects (préparées depuis les e-mails reçus) : aperçu, puis application. */
export function RepliesImport({ labels }: { labels: Record<string, string> }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<RepliesState>(null);
  const [pending, start] = useTransition();
  const send = (action: typeof previewRepliesAction) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("fichier", file);
    start(async () => setState(await action(null, fd)));
  };
  const label = (s: string | null) => (s ? (labels[s] ?? s) : "inchangé");
  const plan = state?.ok && state.step === "preview" ? state.plan : null;
  const todo = plan
    ? plan.counts.change + plan.counts.note + plan.counts.protected
    : 0;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="font-display text-xl">Importer les réponses</h2>
        <p className="text-sm text-ink-muted">
          Un fichier CSV ou Excel, une ligne par réponse : email, statut, date,
          note, relance. Statut vide : une note seulement.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(previewRepliesAction);
        }}
      >
        <label className="grid gap-1 text-sm font-semibold">
          Fichier des réponses
          <input
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setState(null);
            }}
            className="text-sm font-normal"
          />
        </label>
        <button
          type="submit"
          disabled={!file || pending}
          className="min-h-11 rounded-full bg-surface-inverse px-5 text-sm font-semibold text-ink-inverse disabled:opacity-50"
        >
          {pending && !plan ? "Lecture…" : "Lire le fichier"}
        </button>
      </form>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {plan ? (
        <div className="grid gap-3">
          <p role="status" className="text-sm">
            {plan.counts.change} statut(s) à changer, {plan.counts.note}{" "}
            note(s), {plan.counts.protected} protégé(s), {plan.counts.unknown}{" "}
            adresse(s) inconnue(s), {plan.counts.invalid} ligne(s) invalide(s).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Aperçu de l’import des réponses
              </caption>
              <thead>
                <tr className="text-ink-muted">
                  <th scope="col" className="p-2 font-medium">
                    Ligne
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Prospect
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Statut
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Effet
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.line} className="border-t border-line align-top">
                    <td className="p-2 tabular-nums">{r.line}</td>
                    <td className="p-2">
                      <span className="font-semibold">
                        {r.organisation ?? "Prospect inconnu"}
                      </span>
                      <br />
                      <span className="text-ink-muted">{r.email}</span>
                    </td>
                    <td className="p-2">
                      {r.action === "change"
                        ? `${label(r.current)} → ${label(r.next)}`
                        : label(r.current)}
                    </td>
                    <td className="p-2">
                      {ACTIONS[r.action]}
                      {r.reason ? (
                        <span className="text-ink-muted">
                          {" "}
                          : {REASONS[r.reason] ?? r.reason}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-80 p-2 text-ink-muted">
                      {r.note}
                      {r.followUp ? ` (relance le ${r.followUp})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button
              type="button"
              disabled={pending || todo === 0}
              onClick={() => send(applyRepliesAction)}
              className="min-h-11 rounded-full bg-surface-inverse px-5 text-sm font-semibold text-ink-inverse disabled:opacity-50"
            >
              {pending
                ? "Application…"
                : `Appliquer (${todo} ligne${todo > 1 ? "s" : ""})`}
            </button>
          </div>
        </div>
      ) : null}
      {state?.ok && state.step === "applied" ? (
        <p role="status" className="text-sm">
          Import appliqué : {state.counts.change} statut(s) changé(s),{" "}
          {state.counts.note + state.counts.protected} note(s) ajoutée(s).{" "}
          <Link
            href="/admin/prospection/prospects"
            className="font-semibold underline"
          >
            Voir les prospects
          </Link>
        </p>
      ) : null}
    </div>
  );
}
