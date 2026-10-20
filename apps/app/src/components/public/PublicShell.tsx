import { brandCssVars } from "@evoly/ui";
import "@evoly/ui/brand-fonts.css";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { Logo } from "../Brand";
import type { PublicOrganization } from "@/server/publicEvents";

const SOCIAL_NAMES = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube" } as const;

/** En-tête et pied de page publics. Couleurs de l'organisateur en Pro, avec contraste automatique (RG-UI-01). */
export async function PublicShell({ org, homeHref, children }: { org: PublicOrganization; homeHref: string; children: ReactNode }) {
  const t = await getTranslations("public");
  // RG-BRD-01 : couleurs, arrondi, polices et fond de l'organisateur (Pro), texte toujours lisible (RG-UI-01)
  const vars = brandCssVars(org.brand ?? {});
  const style = Object.keys(vars).length ? (vars as CSSProperties) : undefined;
  const primary = org.brand?.primaryColor ?? null;
  const accent = org.brand?.accentColor ?? primary;
  const name = org.brand?.displayName ?? org.name;
  // réseaux sociaux et site web de l'organisateur (Pro), dans l'ordre de la page Marque
  const links = (org.brand?.socialLinks ?? {}) as Record<string, string>;
  const socials = (["website", "instagram", "facebook", "tiktok", "linkedin", "youtube"] as const)
    .filter((k) => typeof links[k] === "string" && links[k].startsWith("https://"))
    .map((k) => [k, links[k]!] as const);
  return (
    <div className="min-h-dvh bg-surface text-ink" style={style} data-brand={primary || accent ? "" : undefined}>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-4 sm:px-8">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3">
          {org.brand?.logoUrl ? (
            <img src={org.brand.logoUrl} alt={name} className="h-9 w-auto" />
          ) : (
            <span className="truncate font-display text-lg tracking-[-0.03em]">{name}</span>
          )}
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
        <p>
          © {new Date().getFullYear()} {name}
        </p>
        {socials.length ? (
          <nav aria-label={t("socials")} className="flex flex-wrap gap-x-4 gap-y-2">
            {socials.map(([k, href]) => (
              <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-4 hover:underline">
                {k === "website" ? t("website") : SOCIAL_NAMES[k]}
              </a>
            ))}
          </nav>
        ) : null}
        {org.showPoweredBy ? (
          <a href="https://evoly.me" className="font-semibold text-ink">
            {t("poweredBy")}
          </a>
        ) : null}
      </footer>
    </div>
  );
}
