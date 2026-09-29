import { LOCALES } from "@evoly/i18n";
import { getLocale } from "next-intl/server";
import { setLocaleAction } from "@/app/(auth)/actions";
import { cn } from "./ui/cn";

const LABELS = { fr: "FR", en: "EN" } as const;

/** Choix de la langue, mémorisé (section 7.3). Fonctionne sans JavaScript. */
export async function LocaleSwitch({ className }: { className?: string }) {
  const current = await getLocale();
  return (
    <form action={setLocaleAction} className={cn("flex items-center gap-1 rounded-full bg-surface-sunken p-1", className)}>
      {LOCALES.map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          aria-pressed={current === l}
          className={cn("h-8 min-w-10 rounded-full px-3 font-label text-xs font-bold", current === l ? "bg-surface-inverse text-ink-inverse" : "text-ink-muted hover:text-ink")}
        >
          {LABELS[l]}
        </button>
      ))}
    </form>
  );
}
