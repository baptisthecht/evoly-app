import { buildCsp } from "./src/lib/csp";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Politique de contenu : scripts, cadres et connexions limités à l'app et à Stripe ; jamais intégrée dans un autre site.
// « unsafe-inline » reste nécessaire aux scripts de démarrage de Next.js (pas de nonce) ; en production seulement
// (le mode développement exige en plus « unsafe-eval »).
const csp = buildCsp();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // caméra autorisée pour l'app elle-même : le scanner des entrées en a besoin ; paiement pour Stripe (Apple Pay, Google Pay)
  {
    key: "Permissions-Policy",
    value:
      'camera=(self), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
  },
  // HTTPS obligatoire (ignoré par les navigateurs en HTTP, donc sans effet en développement)
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: csp }]
    : []),
];

// mesure de la couverture des parcours complets (E2E_COVERAGE=1) : cartes de correspondance vers les sources, jamais en production
const coverage = process.env.E2E_COVERAGE === "1";

const config: NextConfig = {
  reactStrictMode: true,
  ...(coverage
    ? {
        productionBrowserSourceMaps: true,
        experimental: { serverSourceMaps: true },
      }
    : {}),
  poweredByHeader: false,
  transpilePackages: ["@evoly/core", "@evoly/db", "@evoly/i18n", "@evoly/ui"],
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    // module intégrable (section 9.26) : ni X-Frame-Options ni CSP fixes, l'intercepteur pose frame-ancestors avec les sites déclarés
    const embedHeaders = securityHeaders.filter(
      (h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy",
    );
    return [
      { source: "/((?!integre/).*)", headers: securityHeaders },
      { source: "/integre/:path*", headers: embedHeaders },
    ];
  },
};

export default withNextIntl(config);
