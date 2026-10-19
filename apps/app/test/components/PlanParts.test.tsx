import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { blockBounds, P, RowLabels, S, ShapeView, StandingView, Tables, type PlanBlock } from "@/components/seating/PlanParts";

const block = (over: Partial<PlanBlock> = {}): PlanBlock => ({ id: "b1", kind: "SHAPE", x: 100, y: 50, rotation: 0, params: {}, ...over });
const svg = (ui: React.ReactNode) => render(<svg>{ui}</svg>).container;

describe("éléments de dessin des plans de salle", () => {
  it("paramètres d'un bloc : la valeur si elle a le bon type, sinon la valeur par défaut", () => {
    const b = block({ params: { width: 120, label: "Scène", height: "40" } });
    expect([P(b, "width", 200), P(b, "height", 40), P(b, "absent", 7)]).toEqual([120, 40, 7]);
    expect([S(b, "label"), S(b, "width", "x"), S(b, "absent")]).toEqual(["Scène", "x", ""]);
  });

  it("limites d'une forme : selon sa taille, et élargies quand elle est tournée", () => {
    const flat = blockBounds(block({ params: { width: 100, height: 40 } }), []);
    expect(flat).toEqual({ x1: 50, y1: 30, x2: 150, y2: 70 });
    const turned = blockBounds(block({ rotation: 90, params: { width: 100, height: 40 } }), []);
    expect([Math.round(turned.x2 - turned.x1), Math.round(turned.y2 - turned.y1)]).toEqual([40, 100]); // largeur et hauteur échangées
  });

  it("limites d'un bloc de places : autour de ses places, ou un petit carré s'il n'en a pas", () => {
    const seats = [
      { id: "s1", rowId: "r1", blockId: "b1", x: 0, y: 0 },
      { id: "s2", rowId: "r1", blockId: "b1", x: 60, y: 30 },
      { id: "s3", rowId: "r2", blockId: "autre", x: 900, y: 900 },
    ];
    expect(blockBounds(block({ kind: "ROWS" }), seats)).toEqual({ x1: -16, y1: -16, x2: 76, y2: 46 }); // la place d'un autre bloc est ignorée
    expect(blockBounds(block({ kind: "ROWS" }), [])).toEqual({ x1: 80, y1: 30, x2: 120, y2: 70 });
  });

  it("forme : son libellé, son contour pointillé pour une entrée, ses lignes de terrain pour un terrain", () => {
    const entrance = svg(<ShapeView block={block({ params: { shape: "entrance", label: "Entrée" } })} />);
    expect(entrance.textContent).toBe("Entrée");
    expect(entrance.querySelector("rect")!.getAttribute("stroke-dasharray")).toBe("6 4");
    const pitch = svg(<ShapeView block={block({ params: { shape: "pitch", width: 300, height: 180 } })} />);
    expect([pitch.querySelectorAll("rect").length, pitch.querySelectorAll("line").length, pitch.querySelectorAll("circle").length]).toEqual([4, 1, 1]);
    const stage = svg(<ShapeView block={block({ rotation: 45 })} />);
    expect(stage.querySelector("g")!.getAttribute("transform")).toBe("translate(100 50) rotate(45)");
    expect(stage.querySelector("rect")!.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("espace debout : son libellé et sa capacité", () => {
    const c = svg(<StandingView block={block({ kind: "STANDING", params: { label: "Fosse", capacity: 400 } })} color="#FFB8E8" />);
    expect([...c.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["Fosse", "400"]);
  });

  it("tables : une table ronde au centre de ses places, rectangulaire sinon, avec son nom ; une table sans place n'est pas dessinée", () => {
    const seats = [0, 90, 180, 270].map((deg, i) => ({
      id: `s${i}`,
      rowId: "t1",
      x: 100 + 40 * Math.cos((deg * Math.PI) / 180),
      y: 100 + 40 * Math.sin((deg * Math.PI) / 180),
    }));
    const rows = [
      { id: "t1", name: "Table 1", blockId: "b1" },
      { id: "t2", name: "Table vide", blockId: "b1" },
      { id: "t3", name: "Autre bloc", blockId: "b9" },
    ];
    const round = svg(<Tables block={block({ kind: "TABLE_ROUND" })} seats={seats} rows={rows} />);
    const circle = round.querySelector("circle")!;
    expect([Math.round(Number(circle.getAttribute("cx"))), Math.round(Number(circle.getAttribute("cy"))), Number(circle.getAttribute("r"))]).toEqual([
      100, 100, 24,
    ]); // rayon moyen 40, moins 16
    expect([...round.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["Table 1"]);
    const rect = svg(<Tables block={block({ kind: "TABLE_RECT" })} seats={seats} rows={rows} />);
    expect([rect.querySelectorAll("rect").length, rect.querySelectorAll("circle").length]).toEqual([1, 0]);
  });

  it("noms des rangs : aux deux bouts de chaque rangée, dans son prolongement ; rangée d'une seule place : sans nom", () => {
    const seats = [0, 1, 2].map((i) => ({ id: `a${i}`, rowId: "A", x: i * 30, y: 0 })).concat([{ id: "b0", rowId: "B", x: 0, y: 40 }]);
    const c = svg(
      <RowLabels
        seats={seats}
        rows={[
          { id: "A", name: "A", blockId: "b1" },
          { id: "B", name: "B", blockId: "b1" },
        ]}
      />,
    );
    const labels = [...c.querySelectorAll("text")];
    expect(labels.map((t) => t.textContent)).toEqual(["A", "A"]);
    expect(labels.map((t) => Number(t.getAttribute("x")))).toEqual([-22, 82]); // 22 unités avant la première place, après la dernière
  });
});
