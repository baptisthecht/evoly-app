import { inkOn } from "@evoly/ui";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { Logo } from "../Brand";
import type { PublicOrganization } from "@/server/publicEvents";

/** En-tête et pied de page publics. Couleurs de l'organisateur en Pro, avec contraste automatique (RG-UI-01). */
export async function PublicShell({ org, homeHref, children }: { org: PublicOrganization; homeHref: string; children: ReactNode }) {
  const t = await getTranslations("public");
  const primary = org.brand?.primaryColor ?? null;
  // RG-BRD-01 : bandeau en couleur principale, pastilles et boutons en couleur d'accent, texte choisi pour rester lisible
  const accent = org.brand?.accentColor ?? primary;
  const style = primary || accent ? ({ ...(accent ? { "--accent": accent, "--accent-ink": inkOn(accent) } : {}), ...(primary ? { "--accent-panel": primary, "--accent-panel-ink": inkOn(primary) } : {}) } as CSSProperties) : undefined;
  const name = org.brand?.displayName ?? org.name;
  return (
    <div className="min-h-dvh bg-surface" style={style} data-brand={primary || accent ? "" : undefined}>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-4 sm:px-8">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3">
          {org.brand?.logoUrl ? <img src={org.brand.logoUrl} alt={name} className="h-9 w-auto" /> : <span className="truncate font-display text-lg tracking-[-0.03em]">{name}</span>}
        </Link>
        {org.showPoweredBy ? (
          <a href="https://evoly.me" className="flex shrink-0 items-center gap-2 text-xs text-ink-muted" aria-label={t("poweredBy")}>
            <span className="hidden sm:inline">{t("ticketingBy")}</span>
            <Logo className="h-6 w-auto text-ink" />
          </a>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-8 text-sm text-ink-muted sm:px-8">
        <p>© {new Date().getFullYear()} {name}</p>
        {org.showPoweredBy ? (
          <a href="https://evoly.me" className="font-semibold text-ink">
            {t("poweredBy")}
          </a>
        ) : null}
      </footer>
    </div>
  );
}
