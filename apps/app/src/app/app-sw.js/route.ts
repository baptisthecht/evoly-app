import { LOCALES, MESSAGES } from "@evoly/i18n";
import { palette } from "@evoly/ui";

export const dynamic = "force-static";

/**
 * Service worker de l'application installable. Volontairement minimal : AUCUNE page n'est mise en cache (le tableau
 * de bord contient des données privées, qui ne doivent pas rester sur l'appareil). Sans réseau, une navigation reçoit
 * une page « hors ligne » dans la langue de l'appareil. Le scanner a son propre service worker (scanner-sw.js), sur
 * son propre hôte. Textes tirés des traductions de l'app (espace de noms « pwa »).
 */
export function GET() {
  const texts = Object.fromEntries(LOCALES.map((l) => [l, { title: MESSAGES[l].pwa.offlineTitle, body: MESSAGES[l].pwa.offlineBody, retry: MESSAGES[l].pwa.offlineRetry }]));
  const js = `/* Evoly : application installable, sans cache de pages ; page « hors ligne » sans réseau. */
const TEXTS = ${JSON.stringify(texts)};
const COLORS = ${JSON.stringify({ creme: palette.creme, charbon: palette.charbon, rose: palette.rose })};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function offline() {
  const code = (self.navigator.language || "en").slice(0, 2).toLowerCase();
  const lang = TEXTS[code] ? code : "en";
  const t = TEXTS[lang];
  const html = '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="color-scheme" content="light dark"><title>Evoly</title><style>'
    + 'body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif;background:' + COLORS.creme + ';color:' + COLORS.charbon + '}'
    + 'main{max-width:22rem;text-align:center}h1{font-size:1.5rem;line-height:1.2;margin:16px 0 8px;overflow-wrap:anywhere}p{margin:0 0 24px;opacity:.8}'
    + 'button{min-height:48px;padding:0 24px;border:0;border-radius:999px;font:600 1rem system-ui,sans-serif;background:' + COLORS.charbon + ';color:' + COLORS.creme + ';cursor:pointer}'
    + '.dot{width:56px;height:56px;margin:0 auto;border-radius:16px;background:' + COLORS.charbon + ';box-shadow:inset 0 0 0 14px ' + COLORS.rose + '}'
    + '@media (prefers-color-scheme:dark){body{background:' + COLORS.charbon + ';color:' + COLORS.creme + '}button{background:' + COLORS.creme + ';color:' + COLORS.charbon + '}}'
    + '</style></head><body><main><div class="dot" aria-hidden="true"></div><h1>' + escape(t.title) + '</h1><p>' + escape(t.body) + '</p>'
    + '<button type="button" onclick="location.reload()">' + escape(t.retry) + '</button></main></body></html>';
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).catch(() => offline()));
});
`;
  return new Response(js, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" } });
}
