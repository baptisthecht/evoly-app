/**
 * Règle de sécurité du contenu (CSP), commune à la configuration de Next.js et à l'intercepteur de requêtes.
 * frame-ancestors : 'none' partout, sauf le module de billetterie intégrable, limité aux sites déclarés (section 9.26).
 */
export function buildCsp(frameAncestors = "'none'") {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.stripe.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}
