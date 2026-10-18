import fr from "../../../../packages/i18n/messages/fr.json";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

/** Les vrais textes français : le test voit ce que voit l'utilisateur. */
export function Fr({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="Europe/Brussels">
      {children}
    </NextIntlClientProvider>
  );
}
