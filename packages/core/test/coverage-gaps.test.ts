import { describe, expect, it } from "vitest";
import { validateBlocks } from "../src/campaigns";
import {
  EMAIL_DOC_LIMITS,
  emailDocEventIds,
  emailDocIsEmpty,
  inkFor,
  renderEmailDoc,
  safeEmailUrl,
  validateEmailDoc,
} from "../src/emailDoc";
import { CoreError } from "../src/errors";
import { optionCommission } from "../src/fees";
import {
  PRESALE_ALPHABET,
  isValidCustomPresaleCode,
  normalizePresaleCode,
} from "../src/presale";
import { answerFor, validateQuestion } from "../src/questions";
import { generateBlock } from "../src/seatmap";
import { nextTier } from "../src/tiers";

/** Cas limites jusqu'ici non couverts, relevés par la mesure de couverture du cœur. */
describe("prévente (RG-PRV-01)", () => {
  it("codes sans caractères ambigus, normalisés et validés", () => {
    expect(PRESALE_ALPHABET).not.toMatch(/[O0IL1]/);
    expect(normalizePresaleCode(" vip 2026 ")).toBe("VIP2026");
    expect(normalizePresaleCode("ＶＩＰ")).toBe("VIP"); // caractères pleine chasse ramenés à la forme usuelle
    expect(isValidCustomPresaleCode("VIP-2026")).toBe(true);
    expect(isValidCustomPresaleCode("AB")).toBe(false);
    expect(isValidCustomPresaleCode("VIP_2026")).toBe(false);
  });
});

describe("commission sur les options (RG-OPT-06)", () => {
  const terms = {
    planId: "free",
    currency: "EUR",
    fixedMinor: 29,
    rateBps: 200,
    capMinor: 250,
  };
  it("pourcentage sans part fixe, même plafond que les billets, jamais sur un prix négatif", () => {
    expect(optionCommission(0, terms)).toBe(0);
    expect(optionCommission(200, terms)).toBe(4); // 2 % de 2 €, sans les 0,29 € des billets
    expect(optionCommission(100_000, terms)).toBe(250); // plafond
    expect(() => optionCommission(-1, terms)).toThrow();
  });
});

describe("blocs des campagnes", () => {
  it("image et carte d'événement valides ; carte sans événement refusée", () => {
    expect(
      validateBlocks([
        {
          type: "image",
          url: "https://exemple.be/affiche.jpg",
          alt: "Affiche".repeat(40),
        },
      ]),
    ).toEqual([
      {
        type: "image",
        url: "https://exemple.be/affiche.jpg",
        alt: "Affiche".repeat(40).slice(0, 140),
      },
    ]);
    expect(validateBlocks([{ type: "event", eventId: "evt_123" }])).toEqual([
      { type: "event", eventId: "evt_123" },
    ]);
    expect(validateBlocks([{ type: "event", eventId: "" }])).toBeNull();
  });
});

describe("questions aux acheteurs", () => {
  it("tarifs ciblés filtrés ; réponse longue limitée à 2 000 caractères", () => {
    const q = validateQuestion({
      label: "Allergies ?",
      type: "TEXTAREA",
      required: false,
      ticketTypeIds: ["tt_1", "tt_1", 42, "x".repeat(41)],
    } as never);
    expect(q).toMatchObject({ ok: true });
    expect(
      (q as { value?: { ticketTypeIds?: string[] } }).value?.ticketTypeIds ??
        (q as unknown as { ticketTypeIds: string[] }).ticketTypeIds,
    ).toEqual(["tt_1"]);
    expect(
      answerFor(
        { type: "TEXTAREA", required: false, options: [] },
        " Arachides ",
      ),
    ).toEqual({ ok: true, value: "Arachides" });
    expect(
      answerFor(
        { type: "TEXTAREA", required: false, options: [] },
        "x".repeat(2001),
      ),
    ).toEqual({ ok: false, code: "INVALID" });
  });
});

describe("paliers de prix", () => {
  it("deux paliers qui commencent en même temps : l'ordre choisi par l'organisateur départage", () => {
    const at = new Date("2026-11-01T10:00:00Z");
    const base = {
      priceMinor: 1000,
      quantityLimit: null,
      quantitySold: 0,
      quantityHeld: 0,
      endsAt: null,
    };
    const tiers = [
      { ...base, id: "b", name: "B", startsAt: at, sortOrder: 2 },
      { ...base, id: "a", name: "A", startsAt: at, sortOrder: 1 },
    ];
    expect(nextTier(tiers as never, new Date("2026-10-12T00:00:00Z"))?.id).toBe(
      "a",
    );
  });
});

describe("plan de salle : tables rectangulaires", () => {
  const block = (endSeats: 0 | 1 | 2) =>
    generateBlock({
      kind: "TABLE_RECT",
      name: "Tables",
      x: 0,
      y: 0,
      rotation: 0,
      params: {
        tables: 3,
        seatsPerSide: 4,
        endSeats,
        perRow: 2,
        tableGap: 20,
        labelStart: 1,
        category: "vip",
      },
    });
  it("places des deux grands côtés, plus 0, 1 ou 2 places en bout de table ; zones sans places", () => {
    expect(block(0)).toHaveLength(3);
    expect(block(0)[0]!.seats).toHaveLength(8);
    expect(block(1)[0]!.seats).toHaveLength(9);
    expect(block(2)[2]!.seats).toHaveLength(10);
    expect(block(2).map((t) => t.label)).toEqual(["1", "2", "3"]);
    expect(
      generateBlock({
        kind: "STANDING",
        name: "Fosse",
        x: 0,
        y: 0,
        rotation: 0,
        params: {},
      } as never),
    ).toEqual([]);
  });
});

describe("éditeur d'e-mails", () => {
  it("liens : téléphone accepté pour un lien, refusé pour une image ; valeur non textuelle refusée", () => {
    expect(safeEmailUrl(42)).toBeNull();
    expect(safeEmailUrl("tel:+32470123456")).toBe("tel:+32470123456");
    expect(safeEmailUrl("tel:+32470123456", "image")).toBeNull();
    expect(safeEmailUrl("tel:+32 470 12 34 56")).toBeNull(); // aucune espace dans un lien
  });

  it("document vide, événements cités sans doublon, couleur du texte selon le fond", () => {
    expect(
      emailDocIsEmpty({
        type: "doc",
        content: [
          { type: "horizontalRule" },
          { type: "blockquote", content: [{ type: "paragraph" }] },
        ],
      } as never),
    ).toBe(true);
    expect(
      emailDocIsEmpty({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Oui" }],
                  },
                ],
              },
            ],
          },
        ],
      } as never),
    ).toBe(false);
    const card = (eventId: string) => ({
      type: "eventCard",
      attrs: { eventId },
    });
    expect(
      emailDocEventIds({
        type: "doc",
        content: [
          card("e1"),
          { type: "blockquote", content: [card("e2")] },
          {
            type: "orderedList",
            content: [{ type: "listItem", content: [card("e1")] }],
          },
        ],
      } as never),
    ).toEqual(["e1", "e2"]);
    expect(inkFor("#000")).toBe("#FFFFFF");
    expect(inkFor("#FFF")).not.toBe("#FFFFFF");
  });

  it("validation : titre de niveau inconnu ramené au niveau 2, citation vide retirée, caractères de contrôle supprimés, texte total limité", () => {
    const doc = validateEmailDoc({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 6 },
          content: [{ type: "text", text: "Titre" }],
        },
        { type: "blockquote", content: [] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "A\u0007B" }, { type: "hardBreak" }],
        },
      ],
    });
    expect(doc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
    expect(doc.content.some((b) => b.type === "blockquote")).toBe(false);
    expect(JSON.stringify(doc)).toContain('"AB"');
    const long = validateEmailDoc({
      type: "doc",
      content: Array.from(
        {
          length:
            Math.ceil(
              EMAIL_DOC_LIMITS.totalText / EMAIL_DOC_LIMITS.textPerNode,
            ) + 3,
        },
        () => ({
          type: "paragraph",
          content: [
            { type: "text", text: "x".repeat(EMAIL_DOC_LIMITS.textPerNode) },
          ],
        }),
      ),
    });
    const total = long.content.reduce(
      (n, b) =>
        n +
        ((b as { content?: Array<{ text?: string }> }).content ?? []).reduce(
          (m, i) => m + (i.text?.length ?? 0),
          0,
        ),
      0,
    );
    expect(total).toBeLessThanOrEqual(EMAIL_DOC_LIMITS.totalText);
  });

  it("rendu : souligné, barré, couleur, saut de ligne et prénom", () => {
    const doc = validateEmailDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Bonjour",
              marks: [
                { type: "underline" },
                { type: "strike" },
                { type: "textStyle", attrs: { color: "#E11D48" } },
              ],
            },
            { type: "hardBreak" },
            { type: "mergeTag", attrs: { name: "prenom" } },
          ],
        },
      ],
    });
    const out = renderEmailDoc(doc, { firstName: "Alex" } as never);
    expect(out.html).toContain("<u>");
    expect(out.html).toContain("<s>");
    expect(out.html).toContain("<br>");
    expect(out.html).toContain("Alex");
    expect(out.text).toContain("Alex");
  });
});

describe("erreurs métier", () => {
  it("message explicite, sinon le code", () => {
    expect(new CoreError("CODE_X").message).toBe("CODE_X");
    expect(new CoreError("CODE_X", "Détail").message).toBe("Détail");
  });
});
