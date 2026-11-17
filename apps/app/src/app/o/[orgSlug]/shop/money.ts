/** Symbole de la devise de l'organisation, pour les libellés des champs de prix (« Prix (€) »). */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat("fr-BE", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}
