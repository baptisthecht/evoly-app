import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Politique de contenu : scripts, cadres et connexions limités à l'app et à Stripe ; jamais intégrée dans un autre site.
// « unsafe-inline » reste nécessaire aux scripts de démarrage de Next.js (pas de nonce) ; en production seulement
// (le mode développement exige en plus « unsafe-eval »).
const csp = [
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
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // caméra autorisée pour l'app elle-même : le scanner des entrées en a besoin ; paiement pour Stripe (Apple Pay, Google Pay)
  { key: "Permissions-Policy", value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")' },
  // HTTPS obligatoire (ignoré par les navigateurs en HTTP, donc sans effet en développement)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@evoly/core", "@evoly/db", "@evoly/i18n", "@evoly/ui"],
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(config);
