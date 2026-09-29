"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "../Brand";
import { cn } from "../ui/cn";

export interface SidebarLink {
  key: string;
  href: string;
  group: "main" | "admin";
  pro: boolean;
}

export function Shell({ links, orgSwitcher, account, bell, children }: { links: SidebarLink[]; orgSwitcher: ReactNode; account: ReactNode; bell?: ReactNode; children: ReactNode }) {
  const t = useTranslations("nav");
  const tp = useTranslations("plans");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href.split("/").length <= 3 ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav aria-label={t("main")} className="grid gap-6">
      {(["main", "admin"] as const).map((group) => (
        <ul key={group} className="grid gap-1">
          {links
            .filter((l) => l.group === group)
            .map((l) => (
              <li key={l.key}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-2 rounded-full px-4 py-2 text-[0.92rem] leading-tight font-medium transition-colors",
                    isActive(l.href) ? "bg-rose text-charbon" : "text-creme/80 hover:bg-blanc/10 hover:text-creme",
                  )}
                >
                  {t(l.key)}
                  {l.pro ? <span className="rounded-full bg-lilas px-2 py-0.5 font-label text-[0.65rem] font-bold text-charbon">{tp("pro")}</span> : null}
                </Link>
              </li>
            ))}
        </ul>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <aside className="hidden bg-charbon p-5 text-creme lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6">
        <Logo className="h-9 w-auto self-start text-creme" />
        {orgSwitcher}
        <div className="hidden lg:block">{bell}</div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {account}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-charbon px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 text-creme lg:hidden">
        <Logo className="h-8 w-auto text-creme" />
        <span className="ml-auto">{bell}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav" className="flex h-11 items-center gap-2 rounded-full bg-blanc/10 px-4 text-sm font-semibold">
          {open ? t("closeMenu") : t("menu")}
        </button>
      </header>
      {open ? (
        <div id="mobile-nav" className="fixed inset-x-0 top-[calc(max(env(safe-area-inset-top),0.75rem)+3.5rem)] bottom-0 z-20 flex flex-col gap-6 overflow-y-auto bg-charbon p-5 text-creme lg:hidden">
          {orgSwitcher}
          {nav}
          {account}
        </div>
      ) : null}

      <main className="px-4 pt-6 pb-[max(env(safe-area-inset-bottom),2.5rem)] sm:px-8 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-[var(--content-max)]">{children}</div>
      </main>
    </div>
  );
}
