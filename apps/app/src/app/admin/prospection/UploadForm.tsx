"use client";

import { useActionState } from "react";
import { importLotAction, type ImportState } from "./actions";

/** Import du lot : fichier JSON ou contenu collé ; réparti entre les boîtes et programmé aussitôt. */
export function UploadForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importLotAction, null);
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Coller le lot JSON</span>
        <textarea
          name="json"
          rows={5}
          placeholder='{ "lot": "…", "emails": [ … ] }'
          className="w-full rounded-xl bg-surface-raised p-3 font-mono text-xs ring-1 ring-line-strong"
        />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer">ou choisir le fichier</summary>
        <input type="file" name="fichier" accept="application/json,.json" className="mt-2 text-sm" />
      </details>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)] disabled:opacity-60"
        >
          {pending ? "Import…" : "Importer et envoyer"}
        </button>
      </div>
      {state?.ok === false ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <div role="status" className="grid gap-1 text-sm">
          <p className="font-semibold">
            {state.report.ajoutes} e-mail(s) importé(s) dans le lot {state.report.lot} : {state.report.programmes} programmé(s)
            {state.report.enAttente ? `, ${state.report.enAttente} en attente faute de place aujourd'hui` : ""}.
          </p>
          {state.report.parBoite.map((b) => (
            <p key={b.address}>
              {b.address} : {b.count}
            </p>
          ))}
          {state.report.ignores.map((i) => (
            <p key={`${i.id}-${i.a}`}>
              Ignoré : {i.a} ({i.id}), {i.raison}
            </p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
