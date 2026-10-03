import { describe, expect, it } from "vitest";
import { SEATING_TEMPLATES, bestSeats, createsOrphan, hasOrphanFreeChoice, generateBlock, rowLabel, seatNumbers, seatingTemplate, type BlockSpec, type PlanSeat } from "../src";

const rowsBlock = (over: Partial<Extract<BlockSpec, { kind: "ROWS" }>["params"]> = {}, rot = 0, y = 0): BlockSpec => ({
  kind: "ROWS", name: "Salle", x: 0, y, rotation: rot,
  params: { rows: 2, seatsFirst: 4, seatsLast: 4, seatGap: 30, rowGap: 34, curve: 0, centerAisle: false, aisleGap: 36, rowLabels: { style: "letters", start: "A", skip: [] }, seatNumbering: "ltr", seatStart: 1, categories: ["c1"], accessible: [], ...over },
});

describe("plan de salle : numérotations (section 9.9)", () => {
  it("places : continue dans les deux sens, impairs et pairs de chaque côté, numéro de départ", () => {
    expect(seatNumbers(4, "ltr")).toEqual(["1", "2", "3", "4"]);
    expect(seatNumbers(4, "rtl")).toEqual(["4", "3", "2", "1"]);
    expect(seatNumbers(6, "odd-left")).toEqual(["5", "3", "1", "2", "4", "6"]);
    expect(seatNumbers(5, "odd-left")).toEqual(["5", "3", "1", "2", "4"]);
    expect(seatNumbers(6, "odd-right")).toEqual(["6", "4", "2", "1", "3", "5"]);
    expect(seatNumbers(3, "ltr", 101)).toEqual(["101", "102", "103"]);
  });
  it("rangs : lettres en sautant I et O, au-delà de Z, chiffres, départ au choix", () => {
    const letters = { style: "letters" as const, start: "A", skip: ["I", "O"] };
    expect([7, 8, 12, 13].map((i) => rowLabel(i, letters))).toEqual(["H", "J", "N", "P"]);
    expect([25, 26, 27].map((i) => rowLabel(i, { style: "letters", start: "A", skip: [] }))).toEqual(["Z", "AA", "AB"]);
    expect(rowLabel(4, { style: "numbers", start: "1", skip: [] })).toBe("5");
    expect(rowLabel(0, { style: "letters", start: "C", skip: [] })).toBe("C");
  });
});

describe("plan de salle : géométrie", () => {
  it("rangs droits symétriques, allée centrale, catégories et places pour mobilité réduite", () => {
    const rows = generateBlock(rowsBlock({ centerAisle: true, categories: ["c1", "c2"], accessible: [{ row: 1, ends: 1 }] }));
    expect(rows.map((r) => [r.label, r.category])).toEqual([["A", "c1"], ["B", "c2"]]);
    const xs = rows[0]!.seats.map((s) => s.x);
    expect(xs[0]).toBe(-xs[3]!);
    expect(xs[2]! - xs[1]!).toBe(30 + 36); // l'allée sépare les deux moitiés
    expect(rows[1]!.seats.map((s) => s.accessible)).toEqual([true, false, false, true]);
    expect(rows[1]!.seats[0]!.y - rows[0]!.seats[0]!.y).toBe(34);
  });
  it("arc : les extrémités se referment vers la scène ; rotation de 180° : rangs vers le haut", () => {
    const arc = generateBlock(rowsBlock({ rows: 1, seatsFirst: 9, seatsLast: 9, curve: 0.6 }))[0]!.seats;
    expect(arc[0]!.y).toBeLessThan(arc[4]!.y);
    expect(arc[0]!.angle).toBeGreaterThan(0);
    const north = generateBlock(rowsBlock({}, 180, -250));
    expect(north[0]!.seats[0]!.y).toBeCloseTo(-250);
    expect(north[1]!.seats[0]!.y).toBeLessThan(-250);
  });
  it("tables rondes : places autour de chaque table, numérotées depuis le haut", () => {
    const tables = generateBlock({ kind: "TABLE_ROUND", name: "Tables", x: 0, y: 0, rotation: 0, params: { tables: 2, seats: 4, perRow: 2, tableGap: 30, labelStart: 1, category: "c1" } });
    expect(tables.map((t) => t.label)).toEqual(["1", "2"]);
    const [a, , c] = tables[0]!.seats;
    expect(tables[0]!.seats.map((s) => s.label)).toEqual(["1", "2", "3", "4"]);
    expect(a!.y).toBeLessThan(c!.y);
    const cx = (a!.x + c!.x) / 2, cy = (a!.y + c!.y) / 2;
    const d = tables[0]!.seats.map((s) => Math.round(Math.hypot(s.x - cx, s.y - cy)));
    expect(new Set(d).size).toBe(1);
  });
  it("les dix modèles : des places pour chacun (sauf le plan vide), libellés uniques par rang ; stade de 4 000 places", () => {
    for (const t of SEATING_TEMPLATES) {
      const plan = seatingTemplate(t);
      const rows = plan.blocks.flatMap(generateBlock);
      if (t === "blank") { expect(rows).toHaveLength(0); continue; }
      expect(rows.reduce((n, r) => n + r.seats.length, 0)).toBeGreaterThan(0);
      for (const r of rows) expect(new Set(r.seats.map((s) => s.label)).size).toBe(r.seats.length);
      for (const r of rows) expect(plan.categories.map((c) => c.key)).toContain(r.category);
    }
    expect(seatingTemplate("stadium").blocks.flatMap(generateBlock).reduce((n, r) => n + r.seats.length, 0)).toBe(2 * 20 * 60 + 2 * 20 * 40);
  });
});

describe("plan de salle : meilleures places et sièges isolés", () => {
  const line = (n: number, taken: number[] = [], aisleAfter = -1): PlanSeat[] =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, rowId: "A", order: i, x: i * 30 + (aisleAfter >= 0 && i > aisleAfter ? 40 : 0), y: 0, available: !taken.includes(i) }));
  it("côte à côte, au plus près de la scène, sans laisser de siège isolé", () => {
    const seats = line(8, [0]);
    // [2,3] serait plus central mais isolerait la place 1 : [1,2] est préféré
    expect(bestSeats(seats, 2, { x: 75, y: -100 })).toEqual(["s1", "s2"]);
    expect(bestSeats(seats, 9, { x: 0, y: 0 })).toBeNull();
  });
  it("jamais à cheval sur une allée ; choix de l'acheteur qui isole une place détecté", () => {
    const seats = line(6, [0, 1, 4, 5], 2); // libres : 2 | allée | 3
    expect(bestSeats(seats, 2, { x: 60, y: -100 })!.sort()).toEqual(["s2", "s3"]); // repli : pas de paire côte à côte
    const row = line(6, [0]);
    expect(createsOrphan(row, ["s2"])).toBe(true); // la place 1 resterait seule
    expect(createsOrphan(row, ["s1", "s2"])).toBe(false);
    // seulement des paires libres : impossible de prendre une place seule sans en isoler une → règle non imposée
    expect(hasOrphanFreeChoice(line(5, [2]), 1)).toBe(false);
    expect(hasOrphanFreeChoice(line(5, [2]), 2)).toBe(true);
  });
});
