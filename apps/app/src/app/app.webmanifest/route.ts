import { MESSAGES, negotiateLocale } from "@evoly/i18n";
import { palette } from "@evoly/ui";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Manifeste de l'application installable (PWA), dans la langue du navigateur.
 * Servi sur app.evoly.me seulement : ailleurs (billetteries, scanner, domaines personnalisés), 404.
 */
export function GET(request: Request) {
  if (request.headers.get("host") !== new URL(env().NEXT_PUBLIC_APP_URL).host) return new Response("Not found", { status: 404 });
  const locale = negotiateLocale(request.headers.get("accept-language"));
  const manifest = {
    id: "/",
    name: "Evoly",
    short_name: "Evoly",
    description: MESSAGES[locale].pwa.description,
    lang: locale,
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: palette.creme,
    theme_color: palette.charbon,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600", Vary: "Accept-Language" },
  });
}
