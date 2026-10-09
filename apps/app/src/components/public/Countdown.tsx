"use client";

import { useEffect, useState } from "react";

type Labels = { days: string; hours: string; minutes: string; seconds: string };

/**
 * Décompte jusqu'à `target` (publication ou ouverture des ventes), recalé sur l'heure du serveur :
 * l'horloge du visiteur peut être fausse. À zéro, la page se recharge et le serveur décide de ce qui s'affiche.
 */
export function Countdown({ target, serverNow, labels }: { target: string; serverNow: string; labels: Labels }) {
  const [left, setLeft] = useState(() => Date.parse(target) - Date.parse(serverNow));
  useEffect(() => {
    const skew = Date.parse(serverNow) - Date.now();
    let done = false;
    const tick = () => {
      const ms = Date.parse(target) - (Date.now() + skew);
      setLeft(ms);
      if (ms <= 0 && !done) {
        done = true;
        window.setTimeout(() => window.location.reload(), 900);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target, serverNow]);
  const s = Math.max(0, Math.floor(left / 1000));
  const parts: [number, string][] = [
    [Math.floor(s / 86400), labels.days],
    [Math.floor((s % 86400) / 3600), labels.hours],
    [Math.floor((s % 3600) / 60), labels.minutes],
    [s % 60, labels.seconds],
  ];
  return (
    <div className="flex flex-wrap justify-center gap-2 sm:gap-3" role="timer" aria-live="off">
      {parts.map(([value, label]) => (
        <div key={label} className="grid min-w-[4.25rem] justify-items-center rounded-xl bg-surface-raised px-3 py-2 ring-1 ring-line">
          <span className="font-display text-3xl tabular-nums tracking-[-0.02em]">{String(value).padStart(2, "0")}</span>
          <span className="text-xs text-ink-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}
