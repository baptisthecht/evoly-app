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
import { buttonClass } from "../ui/Button";
import { cn } from "../ui/cn";
import { NavGlyph } from "./SideNav";
import { activeTab, type TabBarSection, type TabBarTab } from "./tabBarItems";

/** Durée de la glissade de la feuille « Plus » (ouverture et fermeture). */
const SLIDE_MS = 260;
/** Fond des tuiles de la feuille « Plus » : neutre (refonte A3 : la couleur porte un sens, pas une décoration). */
const TILE = ["var(--surface-raised)"];

/** Sélecteur d'organisation et compte : en haut de la feuille « Plus » (fournis par la coquille). */
export const TabBarExtras = createContext<ReactNode>(null);

/**
 * Barre d'onglets du téléphone (refonte A3, maquette « Sur téléphone ») : Accueil, Événements, Commandes, Finances et
 * « Plus », qui ouvre le reste de la navigation ; la même dans un événement (ses parties sont dans ses onglets).
 */
export function TabBar({
  label,
  tabs,
  more,
}: {
  label: string;
  tabs: TabBarTab[];
  more: TabBarSection[];
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
  // refonte A3 (maquette « Sur téléphone ») : une barre blanche collée en bas, un filet au-dessus, les onglets et « Plus »
  // en colonnes égales ; l'icône (22 px) au-dessus du libellé (11 px) ; l'onglet actif en charbon, demi-gras, l'icône rose
  // une seule couleur de texte par onglet : deux classes de couleur se disputeraient (cn ne les fusionne pas)
  const item =
    "grid justify-items-center gap-[3px] text-[11px] leading-[normal]";
  const on = "font-semibold text-ink-strong [&>svg]:text-highlight-ink";
  const off = "text-tab-ink";
  return (
    <div className="lg:hidden">
      <nav
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-surface-raised px-2 pt-2"
        style={{
          gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
          paddingBottom:
            "max(26px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
        }}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === current && !open ? "page" : undefined}
            className={cn(item, tab.key === current && !open ? on : off)}
          >
            <TabGlyph tab={tab} />
            {tab.label}
          </Link>
        ))}
        <button
          ref={moreRef}
          type="button"
          onClick={() => (open ? close() : show())}
          aria-expanded={open}
          aria-controls={sheetId}
          className={cn(item, moreOn ? on : off)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className="size-[22px]"
          >
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
          {t("tabBarMore")}
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
              <p className="pt-3 text-center text-[15px] font-semibold">
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
                            "relative inline-flex size-[3.75rem] items-center justify-center rounded-[12px] text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-transform group-active:scale-95",
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
              className={buttonClass("secondary", "md", "mt-6 w-full")}
            >
              {t("tabBarClose")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Icônes de la barre, comme la maquette : la maison, le calendrier sans anneaux, les lignes, les barres sans socle ;
 * les autres pages gardent l'icône de la barre latérale.
 */
function TabGlyph({ tab }: { tab: TabBarTab }) {
  const paths: Record<string, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V21H3z" />,
    events: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
      </>
    ),
    orders: <path d="M4 7h16M4 12h16M4 17h10" />,
    finances: <path d="M4 19V9M10 19V5M16 19v-7" />,
  };
  const own = paths[tab.key];
  if (!own) return <NavGlyph name={tab.icon} className="size-[22px]" />;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="size-[22px] shrink-0"
    >
      {own}
    </svg>
  );
}
