"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Vrai une fois la page active (React a pris la main), faux pendant le rendu du serveur et avant. Un bouton d'envoi
 * qui en dépend reste inactif tant qu'un clic ne peut pas encore être traité : sur un téléphone lent, un appui trop tôt
 * ne recharge plus la page en perdant la saisie, il ne fait rien, et l'adresse tapée reste dans le champ.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
