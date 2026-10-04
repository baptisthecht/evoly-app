import { LOCALE_NAMES, LOCALES, type Locale } from "@evoly/i18n";
import { getLocale } from "next-intl/server";
import { setLocaleAction } from "@/app/(auth)/actions";
import { cn } from "./ui/cn";

/** Choix de la langue, mémorisé (section 7.3) : menu déroulant compact, qui fonctionne sans JavaScript. */
export async function LocaleSwitch({ className }: { className?: string }) {
  const current = (await getLocale()) as Locale;
  return (
    <details className={cn("group relative", className)}>
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-full bg-surface-sunken px-3 font-label text-xs font-bold uppercase [&::-webkit-details-marker]:hidden" aria-label={LOCALE_NAMES[current]}>
        {current}
        <svg viewBox="0 0 12 12" className="size-3 transition-transform group-open:rotate-180" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </summary>
      <form action={setLocaleAction} className="absolute right-0 z-50 mt-2 grid min-w-40 gap-1 rounded-lg bg-surface-raised p-2 shadow-lg ring-1 ring-line">
        {LOCALES.map((l) => (
          <button key={l} name="locale" value={l} lang={l} aria-pressed={current === l} className={cn("min-h-10 rounded-md px-3 text-left text-sm", current === l ? "bg-surface-inverse font-semibold text-ink-inverse" : "hover:bg-surface-sunken")}>
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </form>
    </details>
  );
}
