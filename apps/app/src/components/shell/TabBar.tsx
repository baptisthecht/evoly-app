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
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const close = () => {
    setOpen(false);
    moreRef.current?.focus();
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
          onClick={() => setOpen((v) => !v)}
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
          />
          <div
            id={sheetId}
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("tabBarMoreTitle")}
            className="relative max-h-[85dvh] overflow-y-auto rounded-t-[1.75rem] bg-surface px-4 pt-3 text-ink"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
            }}
          >
            <span
              aria-hidden="true"
              className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-[rgba(34,34,34,0.2)]"
            />
            {extras ? <div className="grid gap-2 pb-3">{extras}</div> : null}
            {more.map((section) => (
              <section key={section.label} className="grid pt-2">
                <h2 className="px-1 pb-1 text-xs font-semibold text-ink-muted">
                  {section.label}
                </h2>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={
                      pathname.replace(/\/$/, "") === item.href
                        ? "page"
                        : undefined
                    }
                    className={cn(
                      "flex min-h-[3.25rem] items-center justify-between gap-3 border-t border-line px-1 text-base",
                      pathname.replace(/\/$/, "") === item.href &&
                        "font-semibold",
                    )}
                  >
                    <span>{item.label}</span>
                    {item.pro ? (
                      <span className="rounded-full bg-surface-accent px-2 py-0.5 text-xs font-semibold">
                        {item.pro}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </section>
            ))}
            <button
              type="button"
              onClick={close}
              className="mt-3 flex min-h-12 w-full items-center justify-center rounded-full bg-surface-inverse font-display text-sm text-ink-inverse"
            >
              {t("tabBarClose")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
