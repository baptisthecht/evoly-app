/** Origine du scanner (scanner.evoly.me), construite comme scannerUrl() : « Ouvrir le scanner » y redirige. */
function scannerOrigin(): string | null {
  const app = process.env.NEXT_PUBLIC_APP_URL;
  const base = process.env.NEXT_PUBLIC_BASE_DOMAIN;
  if (!app || !base) return null;
  try {
    return `${new URL(app).protocol}//scanner.${base}`;
  } catch {
    return null;
  }
}

/**
 * Destinations des formulaires : l'app elle-même et les sites vers lesquels une action serveur redirige (scanner, Stripe
 * Checkout, portail de facturation et inscription Connect, Google, Apple). Un formulaire envoyé avant le chargement du
 * JavaScript (téléphone lent) part comme un formulaire classique : le navigateur soumet alors sa redirection à
 * form-action, et la bloque sans rien afficher si la destination n'y figure pas.
 */
function formAction(): string {
  return [
    "form-action 'self'",
    scannerOrigin(),
    "https://checkout.stripe.com https://billing.stripe.com https://connect.stripe.com",
    "https://accounts.google.com https://appleid.apple.com",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Règle de sécurité du contenu (CSP), commune à la configuration de Next.js et à l'intercepteur de requêtes.
 * frame-ancestors : 'none' partout, sauf le module de billetterie intégrable, limité aux sites déclarés (section 9.26).
 */
export function buildCsp(frameAncestors = "'none'") {
  return [
    "default-src 'self'",
    // Google Analytics et Google Ads : chargés seulement sur l'application, après consentement (components/tracking)
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.stripe.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://*.doubleclick.net",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.googletagmanager.com https://td.doubleclick.net",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    formAction(),
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}
