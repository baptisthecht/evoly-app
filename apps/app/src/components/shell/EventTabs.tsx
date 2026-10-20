"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeEventTab, type EventTab, type HiddenFeature } from "./eventTabs";

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** Onglets de l'événement et pages de la partie active (seconde rangée), avec les fonctionnalités à ajouter. */
export function EventTabs({ tabs, hidden }: { tabs: EventTab[]; hidden: HiddenFeature[] }) {
  const t = useTranslations("nav");
  const path = (usePathname() ?? "").replace(/\/$/, "");
  const active = activeEventTab(tabs, hidden, path);
  const tab = tabs.find((x) => x.key === active)!;
  const here = hidden.find((h) => h.tab === active && under(path, h.href));
  const items = here ? [...tab.items, { label: here.label, href: here.href }] : tab.items;
  const toAdd = hidden.filter((h) => h.tab === active && h !== here);
  return (
    <div className="grid gap-3">
      <nav
        aria-label={t("eventSections")}
        className="-mb-px flex gap-1 overflow-x-auto border-b border-line [mask-image:linear-gradient(to_right,#000_82%,transparent)] sm:[mask-image:none]"
      >
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.href}
            aria-current={x.key === active ? "page" : undefined}
            className={
              x.key === active
                ? "shrink-0 border-b-2 border-ink px-3 py-2.5 text-sm font-medium whitespace-nowrap text-ink"
                : "shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-ink-muted hover:text-ink"
            }
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {items.length > 1 || toAdd.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <nav aria-label={t("sectionPages")} className="flex flex-wrap gap-1.5">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={under(path, i.href) ? "page" : undefined}
                className={
                  under(path, i.href)
                    ? "inline-flex h-9 items-center rounded-md bg-surface-raised px-3 text-[0.8125rem] font-medium shadow-sm ring-1 ring-line"
                    : "inline-flex h-9 items-center rounded-md px-3 text-[0.8125rem] text-ink-muted hover:bg-surface-raised hover:text-ink"
                }
              >
                {i.label}
              </Link>
            ))}
          </nav>
          {toAdd.length ? (
            <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 text-[0.8125rem] text-ink-muted hover:text-ink">
                + {t("addFeature")}
              </summary>
              <ul className="absolute z-20 mt-1.5 grid w-72 gap-0.5 rounded-md bg-surface-raised p-1 shadow-md ring-1 ring-line">
                {toAdd.map((h) => (
                  <li key={h.key}>
                    <Link href={h.href} className="grid rounded-sm px-2.5 py-2 hover:bg-surface">
                      <span className="text-[0.8125rem] font-medium">{h.label}</span>
                      <span className="text-xs text-ink-muted">{h.hint}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
