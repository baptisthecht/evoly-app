import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Nettoyage du HTML brut (bloc « HTML » de l'éditeur, réservé aux utilisateurs avancés). Liste blanche stricte,
 * limitée à ce qu'utilise un e-mail : aucun script, gestionnaire d'événement, cadre, formulaire, SVG, feuille de style,
 * balise meta ou base ; styles intégrés vérifiés propriété par propriété (jamais d'url() ni d'expression()) ;
 * liens en https, http, mailto ou tel, images en https seulement. Appliqué à l'enregistrement puis à chaque rendu.
 */
const LENGTH = /^-?\d+(?:\.\d+)?(?:px|em|rem|%|pt)?$/i;
const BOX = /^(?:-?\d+(?:\.\d+)?(?:px|em|rem|%|pt)?|auto)(?:\s+(?:-?\d+(?:\.\d+)?(?:px|em|rem|%|pt)?|auto)){0,3}$/i;
const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i;
const BORDER =
  /^(?:(?:\d+(?:\.\d+)?(?:px|em)?|thin|medium|thick)\s*)?(?:none|solid|dashed|dotted|double)?\s*(?:#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,]+\))?$/i;
const STYLES: Record<string, RegExp[]> = {
  color: [COLOR],
  background: [COLOR],
  "background-color": [COLOR],
  "font-family": [/^[a-z0-9 ,'"-]{1,120}$/i],
  "font-size": [LENGTH],
  "font-weight": [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
  "font-style": [/^(?:normal|italic)$/i],
  "text-align": [/^(?:left|right|center|justify)$/i],
  "text-decoration": [/^(?:none|underline|line-through)$/i],
  "text-transform": [/^(?:none|uppercase|lowercase|capitalize)$/i],
  "line-height": [/^\d+(?:\.\d+)?(?:px|em|%)?$/i],
  "letter-spacing": [LENGTH],
  "vertical-align": [/^(?:top|middle|bottom|baseline)$/i],
  display: [/^(?:block|inline|inline-block|table|table-row|table-cell|none)$/i],
  width: [LENGTH, /^auto$/i],
  "max-width": [LENGTH],
  height: [LENGTH, /^auto$/i],
  padding: [BOX],
  "padding-top": [LENGTH],
  "padding-right": [LENGTH],
  "padding-bottom": [LENGTH],
  "padding-left": [LENGTH],
  margin: [BOX],
  "margin-top": [LENGTH],
  "margin-right": [LENGTH],
  "margin-bottom": [LENGTH],
  "margin-left": [LENGTH],
  border: [BORDER],
  "border-top": [BORDER],
  "border-right": [BORDER],
  "border-bottom": [BORDER],
  "border-left": [BORDER],
  "border-radius": [BOX],
  "border-collapse": [/^(?:collapse|separate)$/i],
};

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "caption",
    "center",
    "code",
    "div",
    "em",
    "font",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ],
  allowedAttributes: {
    "*": ["style", "align", "valign", "dir", "title", "width", "height", "bgcolor"],
    a: ["href", "target", "rel", "name"],
    img: ["src", "alt", "border"],
    table: ["cellpadding", "cellspacing", "border", "role"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    font: ["color", "face", "size"],
  },
  allowedSchemes: ["https", "http", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  allowedStyles: { "*": STYLES },
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "title", "head", "template", "svg", "math", "iframe", "object"],
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }) },
  exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
};

/** Ce qui a été retiré, pour prévenir l'utilisateur dans l'éditeur. */
export type HtmlWarning = "SCRIPT" | "EVENT_HANDLER" | "DANGEROUS_URL" | "EMBED" | "FORM" | "STYLESHEET" | "META";
const CHECKS: Array<[HtmlWarning, RegExp]> = [
  ["SCRIPT", /<\s*script\b/i],
  ["EVENT_HANDLER", /[\s"'/]on[a-z]+\s*=/i],
  ["DANGEROUS_URL", /(?:javascript|vbscript|data)\s*:|&#x?0*(?:106|6a);?\s*a/i],
  ["EMBED", /<\s*(?:iframe|frame|frameset|object|embed|applet|svg|math)\b/i],
  ["FORM", /<\s*(?:form|input|button|select|textarea)\b/i],
  ["STYLESHEET", /<\s*(?:style|link)\b/i],
  ["META", /<\s*(?:meta|base)\b/i],
];

export function sanitizeEmailHtml(raw: string): string {
  return sanitizeHtml(raw, OPTIONS).trim();
}

export function inspectEmailHtml(raw: string): { html: string; warnings: HtmlWarning[] } {
  return { html: sanitizeEmailHtml(raw), warnings: CHECKS.filter(([, re]) => re.test(raw)).map(([code]) => code) };
}
