/**
 * Publication programmée (RG-PRG-01 à 03) : avant `publishAt`, l'événement est invisible ou présenté par une annonce,
 * et rien ne peut être acheté ; les ventes ouvrent à la plus tardive des deux dates (publication, ouverture des ventes).
 */
export function isPrepublished(event: { publishAt: Date | null }, now: Date = new Date()): boolean {
  return event.publishAt !== null && event.publishAt > now;
}

export function salesOpeningAt(event: { publishAt: Date | null; salesStartAt: Date | null }): Date | null {
  const { publishAt, salesStartAt } = event;
  if (!publishAt) return salesStartAt;
  if (!salesStartAt) return publishAt;
  return publishAt > salesStartAt ? publishAt : salesStartAt;
}
