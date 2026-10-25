"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../ui/cn";
import { NavGlyph } from "./SideNav";
import { activeTab, type TabBarSection, type TabBarTab } from "./tabBar";

/** Durée de la glissade de la feuille « Plus » (ouverture et fermeture). */
const SLIDE_MS = 260;
/** Couleur des tuiles, une par partie de la feuille « Plus » (couleurs de la marque). */
const TILE = [
  "var(--evoly-rose)",
  "var(--evoly-lilas)",
  "var(--evoly-bulle)",
  "var(--surface-raised)",
];

/** Sélecteur d'organisation et compte : en haut de la feuille « Plus » (fournis par la coquille). */
export const TabBarExtras = createContext<ReactNode>(null);

/**
 * Barre d'onglets du téléphone (maquette validée : capsule flottante, variante D) :
 * l'onglet actif se déploie avec son libellé ; « Plus » ouvre le reste de la
 * navigation ; dans un événement, son étiquette ramène à la liste des événements.
 */
export function TabBar({
  label,
  tabs,
  more,
  event,
}: {
  label: string;
  tabs: TabBarTab[];
  more: TabBarSection[];
  event?: { name: string; leaveHref: string };
}) {
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "";
  const extras = useContext(TabBarExtras);
  // feuille « Plus » : montée (open), glissée en place (shown), tirée vers le bas (dy, en pixels)
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const sheetId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const still = () =>
    typeof window === "undefined" ||
    !window.matchMedia ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    setOpen(false);
    setShown(false);
    setDy(0);
  }, [pathname]);
  const show = () => {
    setDy(0);
    setOpen(true);
    if (still()) setShown(true);
    else
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  };
  const close = () => {
    setShown(false);
    setDragging(false);
    drag.current = null;
    moreRef.current?.focus();
    if (still()) {
      setOpen(false);
      setDy(0);
    } else
      window.setTimeout(() => {
        setOpen(false);
        setDy(0);
      }, SLIDE_MS);
  };
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // poignée : la feuille suit le doigt ; fermée au-delà de 120 px ou par un geste rapide, sinon elle revient
  const grab = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!Number.isFinite(e.clientY)) return;
      drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current || !Number.isFinite(e.clientY)) return;
      drag.current.dy = Math.max(0, e.clientY - drag.current.y);
      setDy(drag.current.dy);
    },
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d) return;
      const speed = d.dy / Math.max(1, performance.now() - d.t);
      if (d.dy > 120 || (d.dy > 24 && speed > 0.6)) close();
      else setDy(0);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
      setDy(0);
    },
  };
  const current = activeTab(tabs, pathname);
  const moreOn = open || current === null;
  // arrondis concentriques : capsule de 68 px (arrondi 34), pastille de 48 px à 10 px du bord (arrondi 24) ;
  // data-pill la soustrait à l'arrondi des boutons du thème Pro (globals.css)
  const pill =
    "inline-flex min-h-12 items-center gap-2 rounded-full bg-surface px-3.5 font-display text-sm text-ink";
  const icon =
    "inline-flex size-12 items-center justify-center rounded-full text-ink-inverse";

  return (
    <div
      className="fixed inset-x-4 z-40 flex flex-col items-start gap-2.5 lg:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      {event ? (
        <Link
          href={event.leaveHref}
          aria-label={t("tabBarLeave", { name: event.name })}
          className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-[var(--evoly-rose)] py-1 pr-2 pl-4 font-display text-sm text-[var(--evoly-charbon)] shadow-[0_8px_20px_rgba(34,34,34,0.18)]"
        >
          <span className="truncate">{event.name}</span>
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[rgba(34,34,34,0.12)]">
            <NavGlyph name="close" className="size-4" />
          </span>
        </Link>
      ) : null}
      <nav
        aria-label={label}
        className="flex h-[4.25rem] w-full items-center justify-between rounded-full bg-surface-inverse px-2.5 shadow-[0_18px_40px_rgba(34,34,34,0.35)]"
      >
        {tabs.map((tab) =>
          tab.key === current && !open ? (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current="page"
              data-pill=""
              className={pill}
            >
              <NavGlyph name={tab.icon} className="size-[1.375rem]" />
              {tab.label}
            </Link>
          ) : (
            <Link
              key={tab.key}
              href={tab.href}
              aria-label={tab.label}
              className={icon}
            >
              <NavGlyph name={tab.icon} className="size-[1.375rem]" />
            </Link>
          ),
        )}
        <button
          ref={moreRef}
          type="button"
          onClick={() => (open ? close() : show())}
          aria-expanded={open}
          aria-controls={sheetId}
          aria-label={moreOn ? undefined : t("tabBarMore")}
          data-pill=""
          className={moreOn ? pill : icon}
        >
          <NavGlyph name="more" className="size-[1.375rem]" />
          {moreOn ? t("tabBarMore") : null}
        </button>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label={t("tabBarClose")}
            onClick={close}
            className="absolute inset-0 bg-[rgba(34,34,34,0.45)]"
            style={{
              opacity: shown ? Math.max(0, 1 - dy / 400) : 0,
              transition:
                dragging || still() ? "none" : `opacity ${SLIDE_MS}ms ease-out`,
            }}
          />
          <div
            id={sheetId}
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("tabBarMoreTitle")}
            className="relative max-h-[85dvh] overflow-y-auto rounded-t-[1.75rem] bg-surface px-4 text-ink"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
              transform: shown ? `translateY(${dy}px)` : "translateY(100%)",
              transition:
                dragging || still()
                  ? "none"
                  : `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
            }}
          >
            <div
              data-grab=""
              {...grab}
              className="sticky top-0 z-10 -mx-4 cursor-grab touch-none bg-surface px-4 pt-3 pb-2 select-none active:cursor-grabbing"
            >
              <span
                aria-hidden="true"
                className="mx-auto block h-1.5 w-10 rounded-full bg-[rgba(34,34,34,0.25)]"
              />
              <p className="pt-3 text-center font-display text-base">
                {t("tabBarMoreTitle")}
              </p>
            </div>
            {extras ? <div className="grid gap-2 pb-2">{extras}</div> : null}
            {/* une seule grille, comme un écran d'accueil : chaque partie garde sa couleur */}
            <ul role="list" className="grid grid-cols-4 gap-x-2 gap-y-4 pt-4">
              {more.flatMap((section, n) =>
                section.items.map((item) => {
                  const here = pathname.replace(/\/$/, "") === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={here ? "page" : undefined}
                        className="group flex flex-col items-center gap-1.5 text-center"
                      >
                        <span
                          className={cn(
                            "relative inline-flex size-[3.75rem] items-center justify-center rounded-[1.1rem] text-[var(--evoly-charbon)] shadow-[0_1px_0_rgba(34,34,34,0.08)] transition-transform group-active:scale-95",
                            here &&
                              "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                          )}
                          style={{ background: TILE[n % TILE.length] }}
                        >
                          <NavGlyph name={item.icon} className="size-7" />
                          {item.pro ? (
                            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-surface-inverse px-1.5 py-0.5 text-[0.625rem] font-semibold text-ink-inverse">
                              {item.pro}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "line-clamp-2 text-xs leading-tight",
                            here && "font-semibold",
                          )}
                        >
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                }),
              )}
            </ul>
            <button
              type="button"
              onClick={close}
              className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-surface-inverse font-display text-sm text-ink-inverse"
            >
              {t("tabBarClose")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
