import { LOCALES, MESSAGES } from "@evoly/i18n";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

// chaque message de chaque langue doit se formater sans erreur (syntaxe ICU : pluriels, sélections, balises)
function flat(o: unknown, p = ""): Array<[string, string]> {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "string" ? [[`${p}${k}`, v] as [string, string]] : flat(v, `${p}${k}.`)));
}

describe("messages : syntaxe valide dans toutes les langues", () => {
  it.each(LOCALES)("%s", (locale) => {
    const errors: string[] = [];
    const t = createTranslator({ locale, messages: MESSAGES[locale], onError: (e) => errors.push(e.message) });
    for (const [key, msg] of flat(MESSAGES[locale])) {
      const values: Record<string, unknown> = Object.fromEntries([...msg.matchAll(/\{(\w+)[,}]/g)].map((m) => [m[1], 1]));
      for (const m of msg.matchAll(/<(\w+)>/g)) values[m[1]!] = (chunks: string) => chunks;
      const out = t.markup(key as never, values as never);
      if (typeof out !== "string" || out.includes("{") && !msg.includes("'{")) errors.push(`${key} : ${out}`);
    }
    expect(errors).toEqual([]);
  });
});
