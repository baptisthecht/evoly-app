import { contrastRatio, inkOn } from "./tokens";

/**
 * Thème de la billetterie d'un organisateur (offre Pro) : arrondi, polices, fond, couleurs ; règles pures. Les polices
 * sont hébergées par Evoly (styles/brand-fonts.css), jamais chargées chez Google (adresse IP des visiteurs).
 */

export const BRAND_RADII = ["square", "soft", "medium", "round", "extra"] as const;
export type BrandRadius = (typeof BRAND_RADII)[number];
/** Cartes (petit, moyen, grand, très grand) et boutons ; sans choix, la charte d'Evoly reste inchangée. */
const RADIUS: Record<BrandRadius, { sm: string; md: string; lg: string; xl: string; control: string }> = {
  square: { sm: "0px", md: "0px", lg: "0px", xl: "0px", control: "0px" },
  soft: { sm: "4px", md: "6px", lg: "8px", xl: "10px", control: "6px" },
  medium: { sm: "8px", md: "10px", lg: "14px", xl: "16px", control: "10px" },
  round: { sm: "10px", md: "14px", lg: "20px", xl: "24px", control: "999px" },
  extra: { sm: "14px", md: "20px", lg: "28px", xl: "32px", control: "999px" },
};

export const BRAND_FONTS = {
  "archivo-black": { label: "Archivo Black", family: '"Archivo Black", Arial, sans-serif', body: false },
  "bebas-neue": { label: "Bebas Neue", family: '"Bebas Neue", Impact, sans-serif', body: false },
  poppins: { label: "Poppins", family: "Poppins, system-ui, sans-serif", body: true },
  inter: { label: "Inter", family: "Inter, system-ui, sans-serif", body: true },
  "dm-sans": { label: "DM Sans", family: '"DM Sans", system-ui, sans-serif', body: true },
  manrope: { label: "Manrope", family: "Manrope, system-ui, sans-serif", body: true },
  montserrat: { label: "Montserrat", family: "Montserrat, system-ui, sans-serif", body: true },
  "space-grotesk": { label: "Space Grotesk", family: '"Space Grotesk", system-ui, sans-serif', body: true },
  nunito: { label: "Nunito", family: "Nunito, system-ui, sans-serif", body: true },
  "playfair-display": { label: "Playfair Display", family: '"Playfair Display", Georgia, serif', body: false },
  lora: { label: "Lora", family: "Lora, Georgia, serif", body: true },
  merriweather: { label: "Merriweather", family: "Merriweather, Georgia, serif", body: true },
} as const;
export type BrandFont = keyof typeof BRAND_FONTS;
export const isBrandFont = (v: unknown): v is BrandFont => typeof v === "string" && v in BRAND_FONTS;
export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

const hex = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");
const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
/** Mélange de deux couleurs (t = part de la seconde). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => hex(v + (y[i]! - v) * t)).join("")}`.toUpperCase();
}

/** Teinte la plus proche qui atteint le contraste voulu, en assombrissant ou en éclaircissant. */
export function readableAgainst(color: string, against: string, target: number): string {
  if (contrastRatio(color, against) >= target) return color.toUpperCase();
  const toward = contrastRatio("#000000", against) >= contrastRatio("#FFFFFF", against) ? "#000000" : "#FFFFFF";
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(color, toward, t);
    if (contrastRatio(c, against) >= target) return c;
  }
  return toward;
}

/** Surfaces, traits et textes déduits du fond : le texte reste lisible (4,5:1), le mode sombre suit un fond foncé. */
export function surfacesFor(background: string) {
  const dark = inkOn(background) === "#FFFFFF";
  const ink = dark ? "#FFF6F0" : "#222222";
  return {
    "--surface": background.toUpperCase(),
    "--surface-raised": dark ? mix(background, "#FFFFFF", 0.07) : contrastRatio(background, "#FFFFFF") < 1.05 ? "#FFFFFF" : mix(background, "#FFFFFF", 0.75),
    "--surface-sunken": mix(background, ink, 0.05),
    "--ink": ink,
    "--ink-muted": readableAgainst(mix(ink, background, 0.3), background, 4.5),
    "--ink-subtle": readableAgainst(mix(ink, background, 0.45), background, 3),
    "--line": mix(background, ink, 0.12),
    "--line-strong": mix(background, ink, 0.25),
    // boutons pleins et éléments inversés (bouton « + », onglet actif) : la couleur du texte sur le fond
    "--surface-inverse": ink,
    "--ink-inverse": background.toUpperCase(),
    "color-scheme": dark ? "dark" : "light",
  };
}

export interface BrandStyle {
  primaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  radius?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
}

export type BrandWarning = { key: "accentOnBackground" | "accentText" | "panelText"; ratio: number; suggestion: string };
/**
 * Contrôle de lisibilité : boutons visibles sur le fond (3:1, WCAG 1.4.11), texte des boutons et du bandeau lisible
 * (4,5:1). Pour chaque alerte, une teinte proche qui fonctionne.
 */
export function brandWarnings(b: BrandStyle): BrandWarning[] {
  const out: BrandWarning[] = [];
  const bg = isHex(b.backgroundColor) ? b.backgroundColor : "#FFF6F0";
  const accent = isHex(b.accentColor) ? b.accentColor : isHex(b.primaryColor) ? b.primaryColor : null;
  if (accent) {
    const onBg = contrastRatio(accent, bg);
    if (onBg < 3) out.push({ key: "accentOnBackground", ratio: Math.round(onBg * 10) / 10, suggestion: readableAgainst(accent, bg, 3) });
    const text = contrastRatio(accent, inkOn(accent));
    if (text < 4.5) out.push({ key: "accentText", ratio: Math.round(text * 10) / 10, suggestion: readableAgainst(accent, inkOn(accent), 4.5) });
  }
  if (isHex(b.primaryColor)) {
    const text = contrastRatio(b.primaryColor, inkOn(b.primaryColor));
    if (text < 4.5) out.push({ key: "panelText", ratio: Math.round(text * 10) / 10, suggestion: readableAgainst(b.primaryColor, inkOn(b.primaryColor), 4.5) });
  }
  return out;
}

/** Arrondi des boutons d'un réglage (e-mails, aperçus) ; aucun réglage : la pilule de la charte. */
export function controlRadiusFor(radius: string | null | undefined): string {
  return radius && (BRAND_RADII as readonly string[]).includes(radius) ? RADIUS[radius as BrandRadius].control : "999px";
}

/** Variables CSS de la billetterie : couleurs (texte posé dessus choisi pour rester lisible), arrondi, polices, fond. */
export function brandCssVars(b: BrandStyle): Record<string, string> {
  const vars: Record<string, string> = {};
  const accent = isHex(b.accentColor) ? b.accentColor : isHex(b.primaryColor) ? b.primaryColor : null;
  if (accent) Object.assign(vars, { "--accent": accent, "--accent-ink": inkOn(accent), "--btn-primary-bg": accent, "--btn-primary-ink": inkOn(accent) });
  if (isHex(b.primaryColor)) Object.assign(vars, { "--accent-panel": b.primaryColor, "--accent-panel-ink": inkOn(b.primaryColor) });
  if (b.radius && (BRAND_RADII as readonly string[]).includes(b.radius)) {
    const r = RADIUS[b.radius as BrandRadius];
    Object.assign(vars, { "--r-sm": r.sm, "--r-md": r.md, "--r-lg": r.lg, "--r-xl": r.xl, "--r-panel": r.xl, "--control-radius": r.control });
  }
  if (isBrandFont(b.headingFont)) vars["--type-display"] = BRAND_FONTS[b.headingFont].family;
  if (isBrandFont(b.bodyFont) && BRAND_FONTS[b.bodyFont].body) {
    // texte courant et libellés (étiquettes, champs, badges) : la même police, sinon les libellés gardent celle d'Evoly
    vars["--type-body"] = BRAND_FONTS[b.bodyFont].family;
    vars["--type-label"] = BRAND_FONTS[b.bodyFont].family;
  }
  if (isHex(b.backgroundColor)) Object.assign(vars, surfacesFor(b.backgroundColor));
  return vars;
}

/** Charte des billetteries (sans réglage) : point de départ des aperçus, l'application ayant son propre thème. */
export const CHARTE_VARS: Record<string, string> = {
  "--type-display": BRAND_FONTS["archivo-black"].family,
  "--type-body": BRAND_FONTS.poppins.family,
  "--surface": "#FFF6F0",
  "--surface-raised": "#FFFFFF",
  "--ink": "#222222",
  "--ink-muted": "#5E5752",
  "--line": "#EADFD6",
  "--r-sm": "8px",
  "--r-md": "12px",
  "--r-lg": "18px",
  "--control-radius": "999px",
};

/** Styles prêts à l'emploi : un clic, puis tout s'ajuste. */
export const BRAND_PRESETS = [
  { key: "evoly", primaryColor: "#FFB8E8", accentColor: "#222222", backgroundColor: null, radius: null, headingFont: null, bodyFont: null },
  {
    key: "gala",
    primaryColor: "#1F1B16",
    accentColor: "#8A6A36",
    backgroundColor: "#FAF7F2",
    radius: "soft",
    headingFont: "playfair-display",
    bodyFont: "lora",
  },
  {
    key: "festival",
    primaryColor: "#FF3D7F",
    accentColor: "#FFD23F",
    backgroundColor: "#1A1033",
    radius: "extra",
    headingFont: "bebas-neue",
    bodyFont: "inter",
  },
  {
    key: "associatif",
    primaryColor: "#BFE3CC",
    accentColor: "#1F7A4D",
    backgroundColor: "#F4FAF6",
    radius: "round",
    headingFont: "nunito",
    bodyFont: "nunito",
  },
  { key: "sobre", primaryColor: "#222222", accentColor: "#222222", backgroundColor: "#FFFFFF", radius: "square", headingFont: "inter", bodyFont: "inter" },
  { key: "nature", primaryColor: "#3E5C3A", accentColor: "#B4472F", backgroundColor: "#F6F1E7", radius: "medium", headingFont: "manrope", bodyFont: "manrope" },
] as const satisfies ReadonlyArray<BrandStyle & { key: string }>;
