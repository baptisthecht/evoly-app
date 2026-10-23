import { describe, expect, it } from "vitest";
import {
  A4,
  chairCounts,
  customFormat,
  hasSheetMarker,
  paginate,
  placementOrder,
  sheetSlots,
  SHEET_PRESETS,
  type LabelSeat,
} from "../src/seatLabels";

const seat = (
  o: Partial<LabelSeat> & { label: string; sortOrder: number },
): LabelSeat => ({
  id: `s-${o.block?.name ?? "B"}-${o.row?.name ?? "A"}-${o.label}`,
  block: { name: "Parterre", sortOrder: 0 },
  row: { name: "A", sortOrder: 0, table: false },
  x: null,
  y: null,
  category: { name: "Standard", color: "#FFB8E8" },
  accessible: false,
  blocked: false,
  ...o,
});

describe("kit d'installation de salle : planches d'étiquettes (RG-ETIQ-02)", () => {
  it("chaque format prédéfini tient dans la feuille A4, au millimètre près, avec le bon nombre d'étiquettes", () => {
    for (const [id, f] of Object.entries(SHEET_PRESETS)) {
      const slots = sheetSlots(f);
      expect(slots).toHaveLength(f.columns * f.rows);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.width).toBeLessThanOrEqual(A4.width + 0.01);
        expect(s.y + s.height).toBeLessThanOrEqual(A4.height + 0.01);
      }
      expect(f.id).toBe(id);
    }
    expect(sheetSlots(SHEET_PRESETS["a4-24"]!)).toHaveLength(24);
    expect(sheetSlots(SHEET_PRESETS["a4-21"]!)[1]).toEqual({
      x: 7.21 + 63.5 + 2.54,
      y: 15.15,
      width: 63.5,
      height: 38.1,
    });
    expect(sheetSlots(SHEET_PRESETS["a4-8"]!)).toHaveLength(8);
    // les étiquettes se décollent ligne par ligne : la 4e est la première de la deuxième ligne
    expect(sheetSlots(SHEET_PRESETS["a4-24"]!)[3]).toEqual({
      x: 0,
      y: 0.5 + 37,
      width: 70,
      height: 37,
    });
  });

  it("grille personnalisée : taille des étiquettes calculée ; grille impossible refusée", () => {
    const f = customFormat({
      columns: 2,
      rows: 5,
      marginTop: 10,
      marginLeft: 10,
      gapX: 5,
      gapY: 3,
    });
    expect([f.labelWidth, f.labelHeight, f.cutMarks]).toEqual([
      92.5,
      53,
      false,
    ]); // (297 − 2 × 10 − 4 × 3) ÷ 5;
    expect(
      customFormat({
        columns: 3,
        rows: 8,
        marginTop: 10,
        marginLeft: 10,
        gapX: 0,
        gapY: 0,
        cutMarks: true,
      }).cutMarks,
    ).toBe(true);
    for (const bad of [
      { columns: 0, rows: 5 },
      { columns: 7, rows: 5 },
      { columns: 2, rows: 17 },
      { columns: 6, rows: 16, marginTop: 40, marginLeft: 40 }, // étiquettes trop petites : 21,7 × 13,6 mm
      { columns: 2, rows: 5, marginTop: -1 },
    ])
      expect(() =>
        customFormat({
          marginTop: 10,
          marginLeft: 10,
          gapX: 0,
          gapY: 0,
          ...bad,
        }),
      ).toThrow("LABEL_GRID_INVALID");
  });

  it("repère de feuille seulement si la marge du haut le permet (RG-ETIQ-06)", () => {
    expect(hasSheetMarker(SHEET_PRESETS["a4-21"]!)).toBe(true);
    expect(hasSheetMarker(SHEET_PRESETS["a4-24"]!)).toBe(false);
  });
});

describe("kit d'installation de salle : ordre de pose (RG-ETIQ-05)", () => {
  // scène en haut du plan : face à la scène, la gauche est à gauche du plan
  const scene = { x: 50, y: 0 };
  it("places dans leur ordre réel sur le rang, de gauche à droite face à la scène, même numérotées impaires puis paires", () => {
    const rang = [
      seat({ label: "1", sortOrder: 0, x: 60, y: 100 }),
      seat({ label: "3", sortOrder: 1, x: 70, y: 100 }),
      seat({ label: "2", sortOrder: 2, x: 40, y: 100 }),
      seat({ label: "4", sortOrder: 3, x: 30, y: 100 }),
    ];
    expect(placementOrder(rang, scene).map((s) => s.label)).toEqual([
      "4",
      "2",
      "1",
      "3",
    ]);
    // scène en bas du plan : face à elle, la gauche du public est à droite du plan
    expect(placementOrder(rang, { x: 50, y: 300 }).map((s) => s.label)).toEqual(
      ["3", "1", "2", "4"],
    );
  });

  it("bloc par bloc puis rang par rang ; sans scène, sans positions ou au centre exact : l'ordre du plan", () => {
    const seats = [
      seat({
        label: "1",
        sortOrder: 0,
        block: { name: "Balcon", sortOrder: 1 },
        row: { name: "A", sortOrder: 0, table: false },
      }),
      seat({
        label: "2",
        sortOrder: 1,
        row: { name: "B", sortOrder: 1, table: false },
      }),
      seat({
        label: "1",
        sortOrder: 0,
        row: { name: "B", sortOrder: 1, table: false },
      }),
      seat({ label: "1", sortOrder: 0 }),
    ];
    expect(
      placementOrder(seats, scene).map(
        (s) => `${s.block.name}${s.row.name}${s.label}`,
      ),
    ).toEqual(["ParterreA1", "ParterreB1", "ParterreB2", "BalconA1"]);
    const placees = [
      seat({ label: "2", sortOrder: 1, x: 10, y: 10 }),
      seat({ label: "1", sortOrder: 0, x: 20, y: 10 }),
    ];
    expect(placementOrder(placees, null).map((s) => s.label)).toEqual([
      "1",
      "2",
    ]);
    expect(
      placementOrder(placees, { x: 15, y: 10 }).map((s) => s.label),
    ).toEqual(["1", "2"]); // scène au centre du rang
    // même position projetée : départage par l'ordre du plan
    const superposees = [
      seat({ label: "b", sortOrder: 1, x: 10, y: 50 }),
      seat({ label: "a", sortOrder: 0, x: 10, y: 60 }),
    ];
    expect(
      placementOrder(superposees, { x: 10, y: 0 }).map((s) => s.label),
    ).toEqual(["a", "b"]);
  });
});

describe("kit d'installation de salle : feuilles et plan de pose (RG-ETIQ-06)", () => {
  it("feuilles dans l'ordre de pose, rangs couverts par chaque feuille, chaises par rang et au total", () => {
    const seats = [
      ...Array.from({ length: 5 }, (_, i) =>
        seat({ label: String(i + 1), sortOrder: i }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        seat({
          label: String(i + 1),
          sortOrder: i,
          row: { name: "B", sortOrder: 1, table: false },
        }),
      ),
    ];
    const f = customFormat({
      columns: 2,
      rows: 3,
      marginTop: 10,
      marginLeft: 10,
      gapX: 0,
      gapY: 0,
    }); // 6 par feuille
    const sheets = paginate(seats, f);
    expect(sheets.map((s) => [s.index, s.slots.length, s.rows])).toEqual([
      [1, 6, ["Parterre · A", "Parterre · B"]],
      [2, 3, ["Parterre · B"]],
    ]);
    expect(sheets[1]!.slots[0]!.slot).toEqual(sheetSlots(f)[0]);
    expect(chairCounts(seats)).toEqual({
      rows: [
        { block: "Parterre", row: "A", chairs: 5 },
        { block: "Parterre", row: "B", chairs: 4 },
      ],
      total: 9,
    });
    expect(paginate([], f)).toEqual([]);
  });
});
