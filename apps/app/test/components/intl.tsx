import fr from "../../../../packages/i18n/messages/fr.json";
import { NextIntlClientProvider, type IntlError } from "next-intl";
import type { ReactNode } from "react";

/** Un texte sans traduction fait échouer le test de l'écran, au lieu de passer inaperçu dans le journal. */
const strict = (error: IntlError) => {
  throw error;
};

/** Les vrais textes français : le test voit ce que voit l'utilisateur. */
export function Fr({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="fr"
      messages={fr}
      timeZone="Europe/Brussels"
      onError={strict}
    >
      {children}
    </NextIntlClientProvider>
  );
}
