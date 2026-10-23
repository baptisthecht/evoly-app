"use client";

import { makeConsent } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { readConsent, saveConsent } from "./cookies";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://evoly.me";

/**
 * Bandeau de consentement : refuser est aussi simple qu'accepter (trois boutons de même importance), rien n'est coché
 * d'avance, le choix se change à tout moment (« Gérer les cookies »).
 */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [ads, setAds] = useState(false);
  useEffect(() => {
    const c = readConsent();
    if (!c) setOpen(true);
    const reopen = () => {
      const now = readConsent();
      setAnalytics(!!now?.analytics);
      setAds(!!now?.ads);
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener("evoly:consent-open", reopen);
    return () => window.removeEventListener("evoly:consent-open", reopen);
  }, []);
  if (!open) return null;
  const choose = (a: boolean, d: boolean) => {
    saveConsent(makeConsent(a, d));
    setOpen(false);
  };
  const button =
    "min-h-11 rounded-full px-5 text-sm font-semibold ring-1 ring-line-strong bg-surface-raised text-ink";
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto grid max-w-xl gap-3 rounded-[var(--r-card)] bg-surface p-5 shadow-lg ring-1 ring-line sm:inset-x-6"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <h2 id="consent-title" className="font-display text-lg">
        {t("title")}
      </h2>
      <p className="text-sm text-ink-muted">
        {t("body")}{" "}
        <a href={`${SITE}/cookies`} className="underline">
          {t("policy")}
        </a>
      </p>
      {custom ? (
        <div className="grid gap-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked disabled className="mt-1" />
            <span>
              <strong>{t("necessary")}</strong> · {t("necessaryHint")}
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong>{t("analytics")}</strong> · {t("analyticsHint")}
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={ads}
              onChange={(e) => setAds(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong>{t("ads")}</strong> · {t("adsHint")}
            </span>
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          onClick={() => choose(false, false)}
        >
          {t("refuse")}
        </button>
        {custom ? (
          <button
            type="button"
            className={button}
            onClick={() => choose(analytics, ads)}
          >
            {t("save")}
          </button>
        ) : (
          <button
            type="button"
            className={button}
            onClick={() => setCustom(true)}
          >
            {t("customize")}
          </button>
        )}
        <button
          type="button"
          className={button}
          onClick={() => choose(true, true)}
        >
          {t("accept")}
        </button>
      </div>
    </section>
  );
}
