"use client";

import { useSyncExternalStore } from "react";

/**
 * Panier de la boutique publique (lot 3b) : gardé dans le navigateur, par organisation, jusqu'au paiement. Il ne fixe
 * ni prix ni stock : le serveur relit tout avant la réservation (RG-SHOP-07).
 */
export interface CartLine {
  variantId: string;
  quantity: number;
}

const EVENT = "evoly-cart";
const key = (organizationId: string) => `evoly-cart:${organizationId}`;

export function readCart(organizationId: string): CartLine[] {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(key(organizationId)) ?? "[]",
    ) as unknown;
    return Array.isArray(raw)
      ? raw
          .filter(
            (l): l is CartLine =>
              !!l &&
              typeof (l as CartLine).variantId === "string" &&
              Number.isInteger((l as CartLine).quantity) &&
              (l as CartLine).quantity > 0,
          )
          .slice(0, 30)
      : [];
  } catch {
    return [];
  }
}

export function writeCart(organizationId: string, lines: CartLine[]): void {
  try {
    if (lines.length)
      window.localStorage.setItem(key(organizationId), JSON.stringify(lines));
    else window.localStorage.removeItem(key(organizationId));
  } catch {
    // navigation privée ou stockage refusé : le panier vit le temps de la page
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Ajoute une quantité d'une variante (20 au plus par ligne). */
export function addToCart(
  organizationId: string,
  variantId: string,
  quantity: number,
): void {
  const lines = readCart(organizationId);
  const line = lines.find((l) => l.variantId === variantId);
  if (line) line.quantity = Math.min(20, line.quantity + quantity);
  else lines.push({ variantId, quantity: Math.min(20, quantity) });
  writeCart(organizationId, lines);
}

const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};

/** Nombre d'articles du panier, à jour dans toutes les pages ouvertes (0 avant que la page soit active). */
export function useCartCount(organizationId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => readCart(organizationId).reduce((n, l) => n + l.quantity, 0),
    () => 0,
  );
}
