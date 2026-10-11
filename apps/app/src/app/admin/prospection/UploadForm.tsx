"use client";

import { useActionState } from "react";
import { importLotAction, type ImportState } from "./actions";

/** Import du lot du jour : fichier JSON ou contenu collé. */
export function UploadForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importLotAction, null);
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Fichier JSON du lot</span>
        <input type="file" name="fichier" accept="application/json,.json" className="text-sm" />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer">ou colle le contenu du lot</summary>
        <textarea name="json" rows={6} className="mt-2 w-full rounded-xl bg-surface-raised p-3 font-mono text-xs ring-1 ring-line-strong" />
      </details>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)] disabled:opacity-60"
        >
          {pending ? "Import…" : "Importer le lot"}
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
            {state.report.ajoutes} e-mail(s) ajouté(s) au lot {state.report.lot}.
          </p>
          {state.report.ignores.length ? (
            <ul className="grid gap-1">
              {state.report.ignores.map((i) => (
                <li key={`${i.id}-${i.a}`}>
                  Ignoré : {i.a} ({i.id}), {i.raison}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
