"use client";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";
import { FIELD_CONTROL_CLASS } from "./Field";
import { CheckIcon } from "./icons";

export interface FontOption {
  value: string;
  label: string;
  /** Famille CSS : le nom de la police s'affiche dans sa propre typographie. */
  family: string;
}

/**
 * Choix d'une police (personnalisation des pages de vente) : chaque police s'affiche dans sa typographie, ce que la liste
 * native des navigateurs ne permet pas partout (Safari, macOS). Liste à choix unique accessible (motif « combobox » sans
 * saisie) : flèches, Début, Fin, Entrée ou Espace, Échap ; la valeur part avec le formulaire par un champ caché.
 */
export function FontSelect({
  id,
  name,
  value,
  options,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  options: FontOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[index]!;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, cursor]);

  const show = () => {
    setCursor(index);
    setOpen(true);
  };
  const choose = (i: number) => {
    onChange(options[i]!.value);
    setOpen(false);
    button.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const moves: Record<string, (c: number) => number> = {
      ArrowDown: (c) => Math.min(options.length - 1, c + 1),
      ArrowUp: (c) => Math.max(0, c - 1),
      Home: () => 0,
      End: () => options.length - 1,
    };
    if (moves[e.key]) {
      e.preventDefault();
      setCursor(moves[e.key]!);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${cursor}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn(FIELD_CONTROL_CLASS, "flex items-center justify-between gap-3 text-left")}
        style={{ fontFamily: selected.family }}
      >
        <span className="truncate">{selected.label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="size-3 shrink-0 text-ink-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md bg-surface-raised py-1 shadow-[var(--elev-lg)] ring-1 ring-line"
        >
          {options.map((o, i) => (
            <li
              key={o.value || "default"}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => setCursor(i)}
              onClick={() => choose(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-base text-ink", i === cursor && "bg-surface-sunken")}
              style={{ fontFamily: o.family }}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value ? <CheckIcon className="size-4 shrink-0" aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
