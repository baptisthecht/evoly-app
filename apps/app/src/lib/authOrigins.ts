/**
 * Origines de confiance de la connexion (Better Auth), en plus de l'adresse de l'app. Apple renvoie la connexion par
 * un formulaire envoyé depuis son propre domaine (réponse « form_post ») : sans cette origine, le retour est refusé et
 * la connexion échoue. Seulement quand la connexion avec Apple est configurée (docs/DEPLOIEMENT.md).
 */
export function trustedOriginsFor(e: { AUTH_APPLE_ID?: string }): string[] {
  return e.AUTH_APPLE_ID ? ["https://appleid.apple.com"] : [];
}
