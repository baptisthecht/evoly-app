"use client";

import { useEffect, useState } from "react";

/** Téléphone : bouton fixe « Voir les billets », masqué quand le bloc des billets est déjà à l'écran. */
export function StickyTicketsButton({ targetId, label }: { targetId: string; label: string }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return setHidden(false);
    const observer = new IntersectionObserver(([entry]) => setHidden(!!entry?.isIntersecting), { threshold: 0.15 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);
  return (
    <div
      aria-hidden={hidden}
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur transition-transform duration-200 motion-reduce:transition-none lg:hidden ${hidden ? "translate-y-full" : "translate-y-0"}`}
    >
      <a
        href={`#${targetId}`}
        tabIndex={hidden ? -1 : 0}
        className="flex h-12 items-center justify-center rounded-full bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
      >
        {label}
      </a>
    </div>
  );
}
