"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/Field";
import type { PlaceSuggestion } from "@/server/places";

/** Valeur posée par le code dans un champ non contrôlé, avec l'événement de saisie (enregistrement automatique). */
export function fillInput(el: HTMLInputElement | null, value: string) {
  if (!el) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onSelect" | "type" | "role"> & {
  id: string;
  /** Lieu ou adresse choisi dans les suggestions. */
  onSelect: (place: PlaceSuggestion) => void;
  invalid?: boolean;
};

/**
 * Lieu ou adresse, avec des suggestions pendant la saisie (Photon via /api/places, dès 3 caractères) ; la saisie libre
 * reste possible. Liste de suggestions accessible : flèches, Entrée pour choisir, Échap pour fermer.
 */
export function AddressSearch({ id, onSelect, onChange, value, className, invalid, ...rest }: Props) {
  const t = useTranslations("addressSearch");
  const locale = useLocale();
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );
  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    if (q.trim().length < 3) {
      setPlaces([]);
      setOpen(false);
      setStatus("idle");
      return;
    }
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      request.current = ctrl;
      setStatus("loading");
      setOpen(true);
      try {
        const res = await fetch(`/api/places?${new URLSearchParams({ q, lang: locale })}`, { signal: ctrl.signal });
        const data = res.ok ? ((await res.json()) as { places: PlaceSuggestion[] }) : { places: [] };
        if (ctrl.signal.aborted) return;
        setPlaces(data.places);
        setActive(data.places.length ? 0 : -1);
        setStatus("done");
      } catch {
        if (!ctrl.signal.aborted) {
          setPlaces([]);
          setStatus("done");
        }
      }
    }, 250);
  };
  const pick = (p: PlaceSuggestion) => {
    if (value === undefined) fillInput(input.current, p.name); // champ non contrôlé : la valeur est posée ici
    onSelect(p);
    setOpen(false);
    setPlaces([]);
    setStatus("idle");
  };
  const listId = `${id}-suggestions`;
  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <Input
        {...rest}
        ref={input}
        id={id}
        value={value}
        invalid={invalid}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        autoComplete="off"
        className={`pl-10 ${className ?? ""}`}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onChange?.(e);
          search(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open || !places.length) {
            if (e.key === "Escape") setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % places.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + places.length) % places.length);
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault(); // choisir, sans envoyer le formulaire
            pick(places[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-md bg-surface-raised shadow-md ring-1 ring-line">
          <ul id={listId} role="listbox" aria-label={t("suggestions")}>
            {places.map((p, i) => (
              <li
                key={p.id}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault(); // le champ garde le focus : le clic choisit
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer flex-col justify-center border-b border-line px-3 py-2 last:border-b-0 ${i === active ? "bg-surface" : ""}`}
              >
                <span className="text-[0.8125rem] font-medium">{p.name}</span>
                {p.detail ? <span className="text-xs text-ink-muted">{p.detail}</span> : null}
              </li>
            ))}
          </ul>
          {status === "loading" && !places.length ? <p className="px-3 py-2.5 text-xs text-ink-muted">{t("searching")}</p> : null}
          {status === "done" && !places.length ? <p className="px-3 py-2.5 text-xs text-ink-muted">{t("noResults")}</p> : null}
          <p className="bg-surface px-3 py-1.5 text-[0.6875rem] text-ink-muted">{t("attribution")}</p>
        </div>
      ) : null}
    </div>
  );
}
