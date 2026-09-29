/** Valeurs de la charte pour le code (graphiques, e-mails, PDF, passes wallet). */
export const palette = {
  charbon: "#222222",
  creme: "#FFF6F0",
  lilas: "#F3D9F0",
  rose: "#FFB8E8",
  graphite: "#3D3D3D",
  bulle: "#FBE3F5",
  blanc: "#FFFFFF",
  success: "#19774E",
  warning: "#A35700",
  danger: "#BD3333",
  noir: "#000000",
  info: "#3B5BDB",
} as const;

export const fonts = {
  display: "Archivo Black",
  label: "Archivo",
  script: "Yellowtail",
  body: "Poppins",
} as const;

/** Familles et graisses à charger (Google Fonts ou auto-hébergement). */
export const fontFaces = [
  { family: "Archivo Black", weights: [400] },
  { family: "Archivo", weights: [300, 700] },
  { family: "Yellowtail", weights: [400] },
  { family: "Poppins", weights: [400, 500, 600] },
] as const;

function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texte charbon ou blanc sur une couleur de marque, selon le meilleur contraste (RG-BRD-01). */
export function inkOn(background: string): "#222222" | "#FFFFFF" {
  return contrastRatio(background, palette.charbon) >= contrastRatio(background, palette.blanc) ? "#222222" : "#FFFFFF";
}
