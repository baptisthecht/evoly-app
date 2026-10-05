import { inkFor, safeEmailColor } from "@evoly/core";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { mergeAttributes, Node } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Extensions de l'éditeur d'e-mails. Les noms des nœuds sont ceux que valide et rend le serveur
 * (packages/core/src/emailDoc.ts) : ce que l'éditeur produit, le serveur le comprend, et rien d'autre.
 * Dans l'éditeur, les blocs spéciaux (bouton, événement, espace, HTML) sont des aperçus simples : leurs
 * réglages se font dans le panneau de l'éditeur, le rendu final dans l'aperçu (calculé par le serveur).
 */
const align = (a: unknown) => (a === "center" || a === "right" ? a : "left");

const MergeTag = Node.create<{ label: string }>({
  name: "mergeTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ label: "prénom" }),
  addAttributes: () => ({ name: { default: "prenom" } }),
  parseHTML: () => [{ tag: "span[data-merge-tag]" }],
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-merge-tag": "prenom", class: "email-chip" }), this.options.label];
  },
  renderText: () => "{{prenom}}",
});

const EmailButton = Node.create({
  name: "button",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ label: { default: "" }, href: { default: "https://" }, color: { default: null }, align: { default: "left" } }),
  parseHTML: () => [{ tag: "div[data-email-button]" }],
  renderHTML({ node }) {
    const color = safeEmailColor(node.attrs.color);
    return [
      "div",
      { "data-email-button": "", class: `email-atom email-atom--button email-align-${align(node.attrs.align)}` },
      ["span", { class: "email-atom__btn", ...(color ? { style: `background:${color};color:${inkFor(color)}` } : {}) }, String(node.attrs.label || "…")],
    ];
  },
});

const EventCard = Node.create<{ titleOf: (id: string) => string }>({
  name: "eventCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addOptions: () => ({ titleOf: (id: string) => id }),
  addAttributes: () => ({ eventId: { default: "" } }),
  parseHTML: () => [{ tag: "div[data-event-card]" }],
  renderHTML({ node }) {
    return ["div", { "data-event-card": "", class: "email-atom email-atom--event" }, this.options.titleOf(String(node.attrs.eventId))];
  },
});

const Spacer = Node.create({
  name: "spacer",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ height: { default: 24 } }),
  parseHTML: () => [{ tag: "div[data-spacer]" }],
  renderHTML({ node }) {
    const h = Math.min(96, Math.max(8, Number(node.attrs.height) || 24));
    return ["div", { "data-spacer": "", class: "email-atom email-atom--spacer", style: `height:${h}px` }];
  },
});

const RawHtml = Node.create<{ label: string }>({
  name: "rawHtml",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addOptions: () => ({ label: "HTML" }),
  addAttributes: () => ({ html: { default: "" } }),
  parseHTML: () => [{ tag: "div[data-raw-html]" }],
  renderHTML() {
    return ["div", { "data-raw-html": "", class: "email-atom email-atom--html" }, `</> ${this.options.label}`];
  },
});

const EmailImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), width: { default: 100 }, align: { default: "center" } };
  },
  renderHTML({ node }) {
    const w = Math.min(100, Math.max(20, Number(node.attrs.width) || 100));
    return [
      "div",
      { class: `email-image email-align-${align(node.attrs.align ?? "center")}` },
      ["img", { src: String(node.attrs.src ?? ""), alt: String(node.attrs.alt ?? ""), style: `width:${w}%` }],
    ];
  },
}).configure({ inline: false, allowBase64: false });

export const EMAIL_BLOCKS = ["button", "image", "eventCard", "spacer", "rawHtml"] as const;

export function emailExtensions(o: { placeholder: string; firstName: string; html: string; titleOf: (id: string) => string }) {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["mailto", "tel"] },
    }),
    TextStyle,
    Color,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    EmailImage,
    EmailButton,
    EventCard.configure({ titleOf: o.titleOf }),
    Spacer,
    RawHtml.configure({ label: o.html }),
    MergeTag.configure({ label: o.firstName }),
    Placeholder.configure({ placeholder: o.placeholder }),
  ];
}
