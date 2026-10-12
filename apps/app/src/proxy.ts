import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

const PROTECTED = ["/o/", "/onboarding", "/acces-scanner", "/admin", "/2fa", "/compte"];
const BASE_DOMAIN = (process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "evoly.me").toLowerCase();
const APP_HOST = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").host.toLowerCase();
/** Hôtes qui ne sont pas des pages d'organisateur (RG-DOM-02). */
const RESERVED = new Set([
  "app",
  "api",
  "www",
  "scanner",
  "admin",
  "mail",
  "support",
  "blog",
  "help",
  "docs",
  "status",
  "evoly",
  "auth",
  "login",
  "register",
  "static",
  "cdn",
  "r",
  "e",
]);

function notFoundPage(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/__introuvable";
  url.search = "";
  return NextResponse.rewrite(url);
}

function siteSubdomain(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase();
  if (!h.endsWith(`.${BASE_DOMAIN}`)) return null;
  const sub = h.slice(0, -(BASE_DOMAIN.length + 1));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sub) || RESERVED.has(sub)) return null;
  return sub;
}

/**
 * Routage par hôte (RG-DOM-01) et filtre d'accès rapide.
 * mon-asso.evoly.me/concert → /site/mon-asso/concert. Les domaines personnalisés s'ajouteront ici.
 * Le contrôle complet des espaces protégés (session, appartenance, droits) reste fait côté serveur.
 */
/** Sites autorisés à afficher le module d'un événement, gardés une minute (section 9.26). */
const embedCache = new Map<string, { at: number; origins: string[] }>();
async function embedOrigins(eventId: string): Promise<string[]> {
  const hit = embedCache.get(eventId);
  if (hit && Date.now() - hit.at < 60_000) return hit.origins;
  let origins: string[] = [];
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? "3000"}/api/embed/${encodeURIComponent(eventId)}`, { cache: "no-store" });
    if (res.ok) origins = ((await res.json()) as { origins?: string[] }).origins ?? [];
  } catch {
    origins = []; // indisponible : affichage refusé, jamais autorisé par défaut
  }
  if (embedCache.size > 5000) embedCache.clear();
  embedCache.set(eventId, { at: Date.now(), origins });
  return origins;
}

/** Module intégrable : affichage dans un cadre limité aux sites déclarés par l'organisateur, langue de la page d'accueil. */
async function embedResponse(request: NextRequest, eventId: string) {
  const headers = new Headers(request.headers);
  const lang = request.nextUrl.searchParams.get("lang")?.slice(0, 2).toLowerCase();
  if (lang && /^[a-z]{2}$/.test(lang)) headers.set("x-evoly-locale", lang);
  const res = NextResponse.next({ request: { headers } });
  const origins = (await embedOrigins(eventId)).filter((o) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(o));
  const ancestors = origins.length ? origins.join(" ") : "'none'";
  res.headers.set("Content-Security-Policy", process.env.NODE_ENV === "production" ? buildCsp(ancestors) : `frame-ancestors ${ancestors}`);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (pathname.startsWith("/integre/")) {
    const eventId = pathname.split("/")[2] ?? "";
    if (!/^[a-z0-9]{10,40}$/i.test(eventId)) return notFoundPage(request);
    return embedResponse(request, eventId);
  }
  // scanner.evoly.me/s/[jeton] → /scanner/s/[jeton] (section 9.17)
  if (host === `scanner.${BASE_DOMAIN}`) {
    const url = request.nextUrl.clone();
    url.pathname = `/scanner${pathname === "/" ? "" : pathname}`;
    const headers = new Headers(request.headers);
    headers.set("x-evoly-scanner", "1");
    return NextResponse.rewrite(url, { request: { headers } });
  }
  // chemins internes : jamais servis directement, page introuvable habituelle
  if (pathname === "/scanner" || pathname.startsWith("/scanner/")) return notFoundPage(request);
  const sub = siteSubdomain(host);
  const hostname = host.split(":")[0] ?? "";
  // domaine personnalisé d'un organisateur (US-BRD-04) : tout hôte qui n'est ni Evoly ni local
  if (
    !sub &&
    hostname &&
    host !== BASE_DOMAIN &&
    host !== APP_HOST &&
    !host.endsWith(`.${BASE_DOMAIN}`) &&
    hostname !== "localhost" &&
    !/^[\d.]+$|^\[/.test(hostname) &&
    hostname.includes(".")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `/site/_d_${hostname}${pathname === "/" ? "" : pathname}`;
    const headers = new Headers(request.headers);
    headers.set("x-evoly-site", `_d_${hostname}`);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (sub) {
    const url = request.nextUrl.clone();
    url.pathname = `/site/${sub}${pathname === "/" ? "" : pathname}`;
    const headers = new Headers(request.headers);
    headers.set("x-evoly-site", sub);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (pathname === "/site" || pathname.startsWith("/site/")) return notFoundPage(request);
  if (PROTECTED.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))) {
    if (!getSessionCookie(request, { cookiePrefix: "evoly" })) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  // section 9.22 et RG-AUTH-08 : parrainage et intention Pro mémorisés 30 jours (inscription souvent faite plus tard)
  const ref = request.nextUrl.searchParams.get("ref");
  const wantsPro = request.nextUrl.searchParams.get("plan") === "pro";
  if ((ref && /^[a-z0-9]{4,20}$/i.test(ref)) || wantsPro) {
    const res = NextResponse.next();
    if (ref && /^[a-z0-9]{4,20}$/i.test(ref))
      res.cookies.set("evoly_ref", ref.toLowerCase(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
    if (wantsPro) res.cookies.set("evoly_plan", "pro", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|scanner-sw\\.js|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
