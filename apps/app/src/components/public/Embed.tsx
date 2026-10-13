"use client";

import { useEffect, useRef } from "react";
import { sanitizeEmbedEvent } from "./embedEvents";

/** Module intégrable : hauteur transmise à la page qui l'accueille, pour un cadre sans barre de défilement (section 9.26). */
export function EmbedHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "evoly:height", height: document.documentElement.scrollHeight }, "*");
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    send();
    return () => observer.disconnect();
  }, []);
  return null;
}

/** « Réserver » : la page de vente s'ouvre dans une fenêtre posée sur le site de l'organisateur (tous les moyens de paiement y fonctionnent). */
export function EmbedBook({ url, label }: { url: string; label: string }) {
  // RG-EMB-07 : la page de l'organisateur apprend l'ouverture, et la commande terminée relayée depuis la fenêtre d'achat
  const popup = useRef<Window | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!popup.current || e.source !== popup.current) return; // seulement la fenêtre ouverte ici
      const ev = sanitizeEmbedEvent(e.data);
      if (ev && window.parent !== window) window.parent.postMessage(ev, "*");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        const w = Math.min(480, window.screen.availWidth || 480);
        const h = Math.min(820, window.screen.availHeight || 820);
        const left = Math.max(0, ((window.screen.availWidth || w) - w) / 2);
        const top = Math.max(0, ((window.screen.availHeight || h) - h) / 2);
        const win = window.open(url, "evoly-billetterie", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
        if (win) {
          popup.current = win;
          e.preventDefault();
        }
        if (window.parent !== window) window.parent.postMessage({ type: "evoly:open" }, "*");
      }}
      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--evoly-charbon)] px-6 font-semibold text-[var(--evoly-creme)]"
    >
      {label}
    </a>
  );
}
