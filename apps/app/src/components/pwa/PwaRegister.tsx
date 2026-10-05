"use client";

import { useEffect } from "react";

/** Événement « beforeinstallprompt » (Chrome, Edge, Android) : l'installation peut être proposée par un bouton. */
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    __evolyInstall?: InstallPromptEvent | null;
  }
}

/** Enregistre le service worker de l'app et garde l'invitation à installer pour le bouton du menu (hôte de l'app seulement). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/app-sw.js", { scope: "/" }).catch(() => undefined);
    const notify = () => window.dispatchEvent(new Event("evoly:installable"));
    const onPrompt = (e: Event) => {
      e.preventDefault(); // pas de bandeau automatique : le bouton « Installer l'application » s'en charge
      window.__evolyInstall = e as InstallPromptEvent;
      notify();
    };
    const onInstalled = () => {
      window.__evolyInstall = null;
      notify();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
