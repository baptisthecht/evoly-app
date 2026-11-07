"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { SavedNote } from "@/components/ui/Controls";

const th =
  "border-b border-line px-2.5 py-[7px] text-[12.5px] leading-[normal] font-medium whitespace-nowrap text-ink-muted";
const td = "border-b border-line p-2.5 align-middle";
import { savePreferencesAction } from "./actions";

type Row = {
  type: string;
  label: string;
  inApp: boolean;
  email: boolean | null;
};
type Labels = {
  type: string;
  inApp: string;
  email: string;
  save: string;
  saved: string;
};

/** Préférences de notification (P1) : par type, dans l'app et par e-mail. */
export function PreferencesForm({
  orgSlug,
  rows,
  labels,
}: {
  orgSlug: string;
  rows: Row[];
  labels: Labels;
}) {
  const [state, setState] = useState(rows);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const toggle = (type: string, key: "inApp" | "email") => {
    setSaved(false);
    setState((s) =>
      s.map((r) => (r.type === type ? { ...r, [key]: !r[key] } : r)),
    );
  };
  return (
    <form
      className="grid gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await savePreferencesAction(
            orgSlug,
            state.filter((r) => !r.inApp).map((r) => r.type),
            state.filter((r) => r.email === false).map((r) => r.type),
          );
          setSaved(true);
        });
      }}
    >
      {/* refonte A3 : en-têtes gris de 12,5 px, cellules à 10 px de marge, un filet sous chaque ligne */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className={th}>
                {labels.type}
              </th>
              <th scope="col" className={`${th} w-28 text-center`}>
                {labels.inApp}
              </th>
              <th scope="col" className={`${th} w-28 text-center`}>
                {labels.email}
              </th>
            </tr>
          </thead>
          <tbody>
            {state.map((r) => (
              <tr key={r.type}>
                <td className={td}>{r.label}</td>
                <td className={`${td} text-center`}>
                  <input
                    type="checkbox"
                    aria-label={`${r.label} : ${labels.inApp}`}
                    checked={r.inApp}
                    onChange={() => toggle(r.type, "inApp")}
                  />
                </td>
                <td className={`${td} text-center`}>
                  {r.email === null ? (
                    <span className="text-ink-faint">-</span>
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={`${r.label} : ${labels.email}`}
                      checked={r.email}
                      onChange={() => toggle(r.type, "email")}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {labels.save}
        </Button>
        {saved ? <SavedNote id="prefs-status">{labels.saved}</SavedNote> : null}
      </div>
    </form>
  );
}
