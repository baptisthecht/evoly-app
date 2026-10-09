"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { savePreferencesAction } from "./actions";

type Row = { type: string; label: string; inApp: boolean; email: boolean | null };
type Labels = { type: string; inApp: string; email: string; save: string; saved: string };

/** Préférences de notification (P1) : par type, dans l'app et par e-mail. */
export function PreferencesForm({ orgSlug, rows, labels }: { orgSlug: string; rows: Row[]; labels: Labels }) {
  const [state, setState] = useState(rows);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const toggle = (type: string, key: "inApp" | "email") => {
    setSaved(false);
    setState((s) => s.map((r) => (r.type === type ? { ...r, [key]: !r[key] } : r)));
  };
  return (
    <form
      className="grid gap-4"
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
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">{labels.type}</th>
              <th className="py-2 pr-3 text-center font-medium">{labels.inApp}</th>
              <th className="py-2 text-center font-medium">{labels.email}</th>
            </tr>
          </thead>
          <tbody>
            {state.map((r) => (
              <tr key={r.type} className="border-t border-line">
                <td className="py-2 pr-3">{r.label}</td>
                <td className="py-2 pr-3 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${r.label} : ${labels.inApp}`}
                    checked={r.inApp}
                    onChange={() => toggle(r.type, "inApp")}
                    className="size-4 accent-ink"
                  />
                </td>
                <td className="py-2 text-center">
                  {r.email === null ? (
                    <span className="text-ink-muted">-</span>
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={`${r.label} : ${labels.email}`}
                      checked={r.email}
                      onChange={() => toggle(r.type, "email")}
                      className="size-4 accent-ink"
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
        {saved ? (
          <p role="status" className="text-sm text-ink-muted">
            {labels.saved}
          </p>
        ) : null}
      </div>
    </form>
  );
}
