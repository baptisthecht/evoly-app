"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "../ui/cn";

/**
 * Sélecteur d'organisation (refonte A3, maquettes UIUX/) : la pastille, le nom et l'offre, sans cadre. Il ouvre, par-dessus
 * la barre, les autres organisations et le compte (notifications, langue, déconnexion) : le bas de la barre reste vide,
 * comme sur les maquettes. Échap, un clic ailleurs ou un lien suivi le referment.
 */
export function OrgMenu({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left font-semibold text-ink",
          open ? "bg-sidebar-raised" : "hover:bg-sidebar-raised",
        )}
      >
        {trigger}
      </button>
      <div
        id={panelId}
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className="absolute inset-x-0 top-full z-40 mt-1 grid gap-px rounded-[10px] bg-surface-raised p-1.5 text-[13.5px] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-line"
      >
        {children}
      </div>
    </div>
  );
}
