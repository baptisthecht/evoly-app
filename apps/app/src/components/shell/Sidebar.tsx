"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "../Brand";

/** Coquille de l'espace organisateur : une barre latérale claire, dont le contenu change de contexte (organisation ou événement). */
export function Shell({
  nav,
  orgSwitcher,
  account,
  bell,
  header,
  children,
}: {
  nav: ReactNode;
  orgSwitcher: ReactNode;
  account: ReactNode;
  bell?: ReactNode;
  /** Bande d'en-tête pleine largeur au-dessus du contenu (en-tête d'un événement). */
  header?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface-raised px-3 py-4 text-ink lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-2">
        <div className="px-2.5 pt-1 pb-2">
          <Logo className="h-8 w-auto text-ink" />
        </div>
        {orgSwitcher}
        <div className="-mx-1 mt-2 flex-1 overflow-y-auto px-1">{nav}</div>
        <div className="grid gap-1 border-t border-line pt-2">
          {bell}
          {account}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface-raised px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 text-ink lg:hidden">
        <Logo className="h-7 w-auto text-ink" />
        <span className="ml-auto">{bell}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold"
        >
          {open ? t("closeMenu") : t("menu")}
        </button>
      </header>
      {open ? (
        <div
          id="mobile-nav"
          className="fixed inset-x-0 top-[calc(max(env(safe-area-inset-top),0.5rem)+3.25rem)] bottom-0 z-20 flex flex-col gap-3 overflow-y-auto bg-surface-raised p-3 text-ink lg:hidden"
        >
          {orgSwitcher}
          {nav}
          {account}
        </div>
      ) : null}

      <div className="min-w-0">
        {header}
        <main className="px-4 pt-5 pb-[max(env(safe-area-inset-bottom),2.5rem)] sm:px-8 lg:px-10 lg:pt-6">
          <div className="mx-auto max-w-[var(--content-max)]">{children}</div>
        </main>
      </div>
    </div>
  );
}
