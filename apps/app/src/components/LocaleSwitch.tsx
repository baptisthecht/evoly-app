import { LOCALE_NAMES, LOCALES, type Locale } from "@evoly/i18n";
import { getLocale } from "next-intl/server";
import { setLocaleAction } from "@/app/(auth)/actions";
import { cn } from "./ui/cn";

/**
 * Choix de la langue, mémorisé (section 7.3) : menu déroulant compact, qui fonctionne sans JavaScript.
 * Couleurs de texte explicites : le sélecteur peut être placé dans une zone sombre (contraste WCAG AA).
 */
/**
 * align : bord du sélecteur sur lequel s'aligne la liste (« end » par défaut, pour un sélecteur placé à droite) ;
 * direction : sens d'ouverture (« up » pour un sélecteur placé en bas d'une barre latérale).
 */
export async function LocaleSwitch({ className, align = "end", direction = "down" }: { className?: string; align?: "start" | "end"; direction?: "down" | "up" }) {
  const current = (await getLocale()) as Locale;
  return (
    <details className={cn("group relative", className)}>
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-full bg-surface-sunken px-3 font-label text-xs font-bold uppercase text-ink [&::-webkit-details-marker]:hidden" aria-label={LOCALE_NAMES[current]}>
        {current}
        <svg viewBox="0 0 12 12" className="size-3 transition-transform group-open:rotate-180" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </summary>
      <form action={setLocaleAction} className={cn("absolute z-50 grid min-w-40 gap-1 rounded-lg bg-surface-raised p-2 text-ink shadow-lg ring-1 ring-line", align === "start" ? "left-0" : "right-0", direction === "up" ? "bottom-full mb-2" : "top-full mt-2")}>
        {LOCALES.map((l) => (
          <button key={l} name="locale" value={l} lang={l} aria-pressed={current === l} className={cn("min-h-10 rounded-md px-3 text-left text-sm", current === l ? "bg-surface-inverse font-semibold text-ink-inverse" : "hover:bg-surface-sunken")}>
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </form>
    </details>
  );
}
