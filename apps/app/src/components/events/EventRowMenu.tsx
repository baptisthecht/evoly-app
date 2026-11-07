"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { eventCommandAction } from "@/app/o/[orgSlug]/events/actions";

const item =
  "flex h-8 w-full items-center rounded-[7px] px-2 text-left text-[13.5px] whitespace-nowrap text-ink hover:bg-surface-hover";

/**
 * Menu « ⋯ » d'une ligne d'événement (refonte A3, maquette UIUX/pages-a3.html) : ouvrir, prévisualiser, copier le lien,
 * dupliquer. Les trois points de la maquette (16 px, gris), une zone de clic plus grande sans changer la mise en page.
 */
export function EventRowMenu({
  base,
  eventId,
  url,
  labels,
}: {
  base: string;
  eventId: string;
  title: string;
  /** Adresse publique ; absente pour un brouillon (rien à copier). */
  url?: string;
  labels: {
    menu: string;
    open: string;
    preview: string;
    copy: string;
    copied: string;
    /** Absent sans le droit de créer un événement. */
    duplicate?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const orgSlug = base.split("/")[2] ?? "";
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
        aria-label={labels.menu}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="relative isolate inline-block size-4 align-middle text-ink-muted before:absolute before:-inset-1.5 before:-z-10 before:rounded-[7px] hover:text-ink hover:before:bg-surface-sunken"
      >
        {/* comme la maquette : l'icône de 16 px dans la ligne de texte, alignée au milieu ; la zone de clic déborde */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          className="block size-4"
        >
          <circle cx="5" cy="12" r=".6" />
          <circle cx="12" cy="12" r=".6" />
          <circle cx="19" cy="12" r=".6" />
        </svg>
      </button>
      <div
        id={id}
        hidden={!open}
        className="absolute top-full right-0 z-30 mt-2 grid min-w-44 gap-px rounded-[10px] bg-surface-raised p-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)] ring-1 ring-line"
      >
        <Link href={`${base}/events/${eventId}`} className={item}>
          {labels.open}
        </Link>
        <Link href={`${base}/events/${eventId}/preview`} className={item}>
          {labels.preview}
        </Link>
        {url ? (
          <button
            type="button"
            className={item}
            onClick={async () => {
              await navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
                setOpen(false);
              }, 1200);
            }}
          >
            {copied ? labels.copied : labels.copy}
          </button>
        ) : null}
        {labels.duplicate ? (
          <form
            action={async () => {
              await eventCommandAction(orgSlug, eventId, "duplicate", null);
            }}
          >
            <button type="submit" className={item}>
              {labels.duplicate}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
