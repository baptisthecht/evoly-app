/**
 * Couleurs du design system pour les contextes sans CSS (dessin SVG, pass wallet, e-mails, données créées par le serveur), RG-UI-02.
 * Miroir exact des jetons de packages/ui/src/styles/tokens.css (--evoly-<nom>), vérifié par un test.
 */
export const PALETTE = {
  charbon: "#222222",
  creme: "#fff6f0",
  blanc: "#ffffff",
  rose: "#ffb8e8",
  info: "#3b5bdb",
  catLilas: "#d9b8f0",
  catBleu: "#a9c4f2",
  planEntrance: "#5c5552",
  seatBlocked: "#d3ccc7",
  planHatchDark: "#b9afa9",
  planHatchLight: "#efe9e5",
  scanChecked: "#1d4ed8",
  seatOutline: "#9a918c",
  planScreen: "#4a4441",
  planZone: "#f1e7e1",
  planZoneLine: "#d8cbc2",
  teaserViolet: "#c9b6ff",
  seatHeld: "#f5c38a",
  seatIn: "#1f8a55",
  planPitch: "#2f7a4f",
  planAltar: "#8a6d3b",
  planBar: "#e5d8cf",
  seatWarning: "#c2410c",
} as const;

export type PaletteColor = keyof typeof PALETTE;
