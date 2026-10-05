"use client";

import { useEffect } from "react";

/** Événement « beforeinstallprompt » (Chrome, Edge, Android) : l'installation peut être proposée par un bouton. */
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    __evolyInstall?: InstallPromptEvent | null;
  }
}

/** Enregistre le service worker de l'app, garde l'invitation à installer pour le bouton du menu, et bloque le zoom dans l'app installée (hôte de l'app seulement). */
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

    // App installée : pas de zoom à deux doigts, comme une app native (en plus de touch-action dans globals.css).
    // Safari : ses gestes de zoom (gesturestart…) sont annulés et la page déclare user-scalable=no. Les plans de salle
    // gèrent leur propre zoom par événements de pointeur : ils ne sont pas concernés.
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const stopZoom = (e: Event) => e.preventDefault();
    if (installed) {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (meta && !meta.content.includes("user-scalable")) meta.content = `${meta.content}, maximum-scale=1, user-scalable=no`;
      for (const type of ["gesturestart", "gesturechange"]) document.addEventListener(type, stopZoom, { passive: false });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      for (const type of ["gesturestart", "gesturechange"]) document.removeEventListener(type, stopZoom);
    };
  }, []);
  return null;
}
