"use client";

import {
  acquisitionFromVisit,
  EVENT_COOKIE,
  googleConsent,
  parseAcquisition,
  parseEvents,
  serializeAcquisition,
  SOURCE_COOKIE,
  SOURCE_MAX_AGE,
  withoutClickIds,
  type Consent,
} from "@evoly/core";
import { useEffect } from "react";
import { readConsent, readCookie, writeCookie } from "./cookies";

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/**
 * Identifiants publics d'Evoly (ils figurent dans chaque page) : utilisés seulement sur evoly.me, jamais en local ni en
 * CI, pour ne pas fausser les statistiques. Les variables d'environnement les remplacent partout.
 */
export const EVOLY_IDS = { ga: "G-CCC58XTQ4D", ads: "", labels: { sign_up: "", organization_created: "" } };
const onEvoly = () => /(^|\.)evoly\.me$/.test(location.hostname);
function ids() {
  const fallback = onEvoly();
  const labels: Record<string, string> = {
    sign_up: process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL || (fallback ? EVOLY_IDS.labels.sign_up : ""),
    organization_created: process.env.NEXT_PUBLIC_GOOGLE_ADS_ORG_LABEL || (fallback ? EVOLY_IDS.labels.organization_created : ""),
  };
  return {
    ga: process.env.NEXT_PUBLIC_GA_ID || (fallback ? EVOLY_IDS.ga : ""),
    ads: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || (fallback ? EVOLY_IDS.ads : ""),
    labels,
  };
}

/** Source de la première visite, avec consentement : gardée si absente ; identifiants de clic retirés si la publicité est refusée. */
function rememberSource(consent: Consent | null) {
  // cookie non nécessaire : seulement avec un consentement (mesure d'audience ou publicité) ; effacé au refus
  if (!consent?.analytics && !consent?.ads) {
    if (readCookie(SOURCE_COOKIE)) writeCookie(SOURCE_COOKIE, "", 0);
    return;
  }
  const current = parseAcquisition(readCookie(SOURCE_COOKIE));
  if (current) {
    if (!consent?.ads && (current.gclid || current.gbraid || current.wbraid))
      writeCookie(SOURCE_COOKIE, serializeAcquisition(withoutClickIds(current)), SOURCE_MAX_AGE);
    return;
  }
  const a = acquisitionFromVisit({
    url: location.href,
    referrer: document.referrer,
    baseDomain: (process.env.NEXT_PUBLIC_BASE_DOMAIN ?? location.hostname).split(":")[0]!,
    adsAllowed: !!consent?.ads,
  });
  writeCookie(SOURCE_COOKIE, serializeAcquisition(a), SOURCE_MAX_AGE);
}

/** Événements confirmés par le serveur (inscription, organisation créée) : envoyés une seule fois, puis effacés. */
function sendServerEvents() {
  const events = parseEvents(readCookie(EVENT_COOKIE));
  if (!events.length) return;
  writeCookie(EVENT_COOKIE, "", 0);
  const { ads, labels } = ids();
  for (const e of events) {
    window.gtag?.("event", e);
    if (ads && labels[e]) window.gtag?.("event", "conversion", { send_to: `${ads}/${labels[e]}` });
  }
}

/**
 * Google Analytics 4 et Google Ads en mode Consentement v2 : tout est refusé par défaut, mis à jour au choix de
 * l'internaute. Sans identifiant configuré, rien n'est chargé ; la source des visites est gardée dans tous les cas
 * (cookie propre, sans donnée personnelle).
 */
export function Analytics() {
  useEffect(() => {
    const consent = readConsent();
    rememberSource(consent);
    const { ga: GA_ID, ads: ADS_ID } = ids();
    if (GA_ID || ADS_ID) {
      window.dataLayer = window.dataLayer ?? [];
      // eslint-disable-next-line prefer-rest-params
      window.gtag =
        window.gtag ??
        function gtag() {
          window.dataLayer!.push(arguments);
        };
      window.gtag("consent", "default", { ...googleConsent(consent), wait_for_update: 500 });
      window.gtag("set", "ads_data_redaction", true);
      window.gtag("set", "url_passthrough", true);
      window.gtag("js", new Date());
      if (GA_ID) window.gtag("config", GA_ID, { anonymize_ip: true });
      if (ADS_ID) window.gtag("config", ADS_ID);
      if (!document.getElementById("evoly-gtag")) {
        const s = document.createElement("script");
        s.id = "evoly-gtag";
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID || ADS_ID)}`;
        document.head.appendChild(s);
      }
    }
    sendServerEvents();
    const onConsent = (e: Event) => {
      const c = (e as CustomEvent<Consent>).detail;
      window.gtag?.("consent", "update", googleConsent(c));
      rememberSource(c);
    };
    window.addEventListener("evoly:consent", onConsent);
    return () => window.removeEventListener("evoly:consent", onConsent);
  }, []);
  return null;
}
