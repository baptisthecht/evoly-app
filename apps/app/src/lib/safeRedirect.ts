/**
 * Adresse de retour après connexion ou double authentification : chemin interne uniquement.
 * Refusés : adresses externes, « //site », barre oblique inverse (lue « // » par les navigateurs), caractères de contrôle.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  if (!/^\/(?![/\\])/.test(value)) return null;
  if (/[\u0000-\u001f\\]/.test(value)) return null;
  return value;
}
