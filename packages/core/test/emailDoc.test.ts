import { describe, expect, it } from "vitest";
import { blocksToEmailDoc, emailDocIsEmpty, inkFor, renderEmailDoc, safeEmailUrl, toEmailDoc, validateEmailDoc } from "../src";

const p = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });
const render = (content: unknown[], extra: Record<string, unknown> = {}) =>
  renderEmailDoc(validateEmailDoc({ type: "doc", content }), { labels: { book: "Voir l'événement" }, ...extra });

describe("document d'e-mail : validation par liste blanche", () => {
  it("écarte les nœuds et marques inconnus, garde ce qui est permis", () => {
    const doc = validateEmailDoc({
      type: "doc",
      content: [p("Bonjour", [{ type: "bold" }, { type: "script" }]), { type: "iframe", attrs: { src: "https://x.test" } }, { type: "horizontalRule" }],
    });
    expect(doc.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "Bonjour", marks: [{ type: "bold" }] }] }, { type: "horizontalRule" }]);
  });

  it("refuse les adresses dangereuses ou relatives, partout", () => {
    for (const bad of [
      "javascript:alert(1)",
      " JaVaScRiPt:alert(1)",
      "data:text/html,<b>x</b>",
      "vbscript:x",
      "/relatif",
      "https://x.test/a b",
      'https://x.test/"onmouseover=1',
    ])
      expect(safeEmailUrl(bad), bad).toBeNull();
    expect(safeEmailUrl("https://evoly.me/a?b=1")).toBe("https://evoly.me/a?b=1");
    expect(safeEmailUrl("mailto:lea@exemple.be")).toBe("mailto:lea@exemple.be");
    expect(safeEmailUrl("http://exemple.be", "image")).toBeNull(); // images : https seulement
    expect(safeEmailUrl("http://localhost:3001/files/a.png", "image")).toBe("http://localhost:3001/files/a.png"); // sauf en développement
    const doc = validateEmailDoc({
      type: "doc",
      content: [
        p("lien", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        { type: "button", attrs: { label: "Go", href: "javascript:alert(1)" } },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
      ],
    });
    expect(doc.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "lien" }] }]);
  });

  it("couleurs : #RGB ou #RRGGBB seulement", () => {
    const doc = validateEmailDoc({
      type: "doc",
      content: [p("a", [{ type: "textStyle", attrs: { color: "red;background:url(x)" } }]), p("b", [{ type: "textStyle", attrs: { color: "#FFB8E8" } }])],
    });
    expect(doc.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "a" }] });
    expect(doc.content[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "b", marks: [{ type: "textStyle", attrs: { color: "#ffb8e8" } }] }] });
  });

  it("bloc HTML : écarté sans nettoyeur, nettoyé avec", () => {
    const raw = { type: "doc", content: [{ type: "rawHtml", attrs: { html: "<p>ok</p><script>x</script>" } }] };
    expect(validateEmailDoc(raw).content).toEqual([]);
    expect(validateEmailDoc(raw, { sanitizeHtml: (h) => h.replace(/<script>.*?<\/script>/g, "") }).content).toEqual([
      { type: "rawHtml", attrs: { html: "<p>ok</p>" } },
    ]);
  });

  it("limite le nombre de blocs", () => {
    expect(validateEmailDoc({ type: "doc", content: Array.from({ length: 500 }, () => ({ type: "horizontalRule" })) }).content).toHaveLength(300);
  });
});

describe("document d'e-mail : rendu pour messageries", () => {
  it("échappe le texte et le prénom (aucune injection possible)", () => {
    const { html } = render(
      [
        p("<script>alert(1)</script>"),
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bonjour " },
            { type: "mergeTag", attrs: { name: "prenom" } },
          ],
        },
      ],
      {
        firstName: '<img src=x onerror="alert(1)">',
      },
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Bonjour &lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("mise en forme, liens, titres, listes, citation, image, espacement", () => {
    const { html } = render([
      { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [{ type: "text", text: "Gala" }] },
      p("gras", [{ type: "bold" }, { type: "link", attrs: { href: "https://evoly.me" } }]),
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [p("un")] },
          { type: "listItem", content: [p("deux")] },
        ],
      },
      { type: "blockquote", content: [p("cité")] },
      { type: "image", attrs: { src: "https://cdn.evoly.me/a.png", width: 50, alt: "Affiche" } },
      { type: "spacer", attrs: { height: 32 } },
    ]);
    expect(html).toContain('<h1 style="margin:0;');
    expect(html).toContain("text-align:center");
    expect(html).toContain('<a href="https://evoly.me/" style="color:#222222;text-decoration:underline"><strong>gras</strong></a>');
    expect(html).toContain("<ul");
    expect(html).toMatch(/<li[^>]*><p[^>]*>un<\/p><\/li>/);
    expect(html).toContain("border-left:3px solid");
    expect(html).toContain('width="228"');
    expect(html).toContain("height:32px");
  });

  it("bouton : couleur de marque ou couleur choisie, texte lisible", () => {
    expect(
      render([{ type: "button", attrs: { label: "Réserver", href: "https://evoly.me" } }], { accent: { background: "#123456", ink: "#ffffff" } }).html,
    ).toContain("background:#123456;color:#ffffff");
    expect(render([{ type: "button", attrs: { label: "Réserver", href: "https://evoly.me", color: "#111111" } }]).html).toContain(
      "background:#111111;color:#FFFFFF",
    );
    expect(inkFor("#ffffff")).toBe("#222222");
    expect(inkFor("#FFB8E8")).toBe("#222222");
    expect(inkFor("#000000")).toBe("#FFFFFF");
  });

  it("carte d'événement et version texte", () => {
    const events = new Map([
      ["evt12345678", { title: "Gala", when: "samedi 14 novembre", place: "Mouscron", url: "https://asso.evoly.me/gala", coverImageUrl: null }],
    ]);
    const { html, text } = render(
      [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Nouveau" }] },
        { type: "eventCard", attrs: { eventId: "evt12345678" } },
        { type: "orderedList", content: [{ type: "listItem", content: [p("a")] }] },
      ],
      { events },
    );
    expect(html).toContain("Gala");
    expect(html).toContain("https://asso.evoly.me/gala");
    expect(text).toBe("NOUVEAU\n\nGala\nsamedi 14 novembre · Mouscron\nVoir l'événement : https://asso.evoly.me/gala\n\n1. a");
  });

  it("bloc HTML rendu seulement avec le nettoyeur du serveur", () => {
    const content = [{ type: "rawHtml", attrs: { html: "<p>ok</p>" } }];
    const doc = validateEmailDoc({ type: "doc", content }, { sanitizeHtml: (h) => h });
    expect(renderEmailDoc(doc, { labels: { book: "" } }).html).toBe("");
    expect(renderEmailDoc(doc, { labels: { book: "" }, sanitizeHtml: (h) => h }).html).toContain("<p>ok</p>");
  });
});

describe("anciennes campagnes", () => {
  it("convertit les blocs à texte brut en document riche", () => {
    const doc = blocksToEmailDoc([
      { type: "heading", text: "Titre" },
      { type: "text", text: "Ligne 1\nLigne 2\n\nParagraphe 2" },
      { type: "image", url: "https://cdn.evoly.me/a.png", alt: "A" },
      { type: "button", label: "Réserver", url: "https://evoly.me" },
      { type: "divider" },
      { type: "event", eventId: "evt12345678" },
    ]);
    expect(doc.content.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph", "image", "button", "horizontalRule", "eventCard"]);
    expect(doc.content[1]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Ligne 1" }, { type: "hardBreak" }, { type: "text", text: "Ligne 2" }],
    });
    expect(toEmailDoc([{ type: "divider" }]).content).toEqual([{ type: "horizontalRule" }]);
  });

  it("document vide ou non", () => {
    expect(emailDocIsEmpty(validateEmailDoc({ type: "doc", content: [{ type: "paragraph" }, { type: "horizontalRule" }] }))).toBe(true);
    expect(emailDocIsEmpty(validateEmailDoc({ type: "doc", content: [p("x")] }))).toBe(false);
  });
});
