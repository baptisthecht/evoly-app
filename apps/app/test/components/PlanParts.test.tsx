import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { blockBounds, P, S, ShapeView, StandingView, type PlanBlock } from "@/components/seating/PlanParts";

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
});
