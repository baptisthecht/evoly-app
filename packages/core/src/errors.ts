/** Erreur métier : un code stable, lisible par l'app pour choisir le message traduit. */
export class CoreError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CoreError";
  }
}
