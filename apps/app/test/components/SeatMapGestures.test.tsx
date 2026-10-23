import { bestSeats } from "@evoly/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SeatMapPicker } from "@/components/public/SeatMapPicker";
import { Fr } from "./intl";

const sp = fr.seatPicker as Record<string, string>;
const seat = (n: number, available = true) => ({
  id: `s${n}`,
  label: String(n),
  order: n,
  x: (n - 1) * 30,
  y: 0,
  categoryId: "c1",
  available,
  accessible: false,
});
const map = (taken: number[] = []) =>
  ({
    focus: { x: 75, y: -100 },
    blocks: [],
    categories: [
      {
        id: "c1",
        name: "Parterre",
        color: "#FFB8E8",
        ticketTypeIds: ["t1"],
        standing: false,
      },
    ],
    rows: [
      {
        id: "r1",
        name: "A",
        blockId: null,
        seats: [1, 2, 3, 4, 5, 6].map((n) => seat(n, !taken.includes(n))),
      },
    ],
  }) as never;
const label = (n: number, state: "selected" | "free") =>
  sp
    .seat!.replace("{row}", "A")
    .replace("{seat}", String(n))
    .replace("{state}", sp[state]!);

/** Le composant parent garde le choix, comme le panier. */
function Harness({
  needed = 2,
  taken = [] as number[],
  fixedMode,
  log,
}: {
  needed?: number;
  taken?: number[];
  fixedMode?: "map" | "view";
  log: (ids: string[], valid: boolean) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <SeatMapPicker
      map={map(taken)}
      needed={{ c1: needed }}
      chosen={chosen}
      fixedMode={fixedMode}
      onChange={(ids, valid) => {
        setChosen(ids);
        log(ids, valid);
      }}
    />
  );
}
const draw = (props: Omit<Parameters<typeof Harness>[0], "log"> = {}) => {
  const log = vi.fn();
  render(
    <Fr>
      <Harness {...props} log={log} />
    </Fr>,
  );
  return log;
};
const press = (n: number, state: "selected" | "free" = "free") =>
  act(
    () =>
      void fireEvent.keyDown(
        screen.getByRole("button", { name: label(n, state) }),
        { key: "Enter" },
      ),
  );

describe("choix des places : gestes au doigt", () => {
  // le navigateur simulé ne connaît pas les événements de pointeur : version minimale, avec la capture du pointeur
  beforeAll(() => {
    class FakePointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    vi.stubGlobal("PointerEvent", FakePointerEvent);
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.hasPointerCapture = () => false;
  });
  const frame = (svg: Element) =>
    svg.getAttribute("viewBox")!.split(/\s+/).map(Number);

  it("glissement d'un doigt : le plan se déplace", () => {
    const { container } = render(
      <Fr>
        <Harness log={() => {}} />
      </Fr>,
    );
    const svg = container.querySelector("svg")!;
    fireEvent.click(screen.getByRole("button", { name: sp.zoomIn! })); // de près, pour pouvoir se déplacer
    const before = frame(svg);
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 160, clientY: 130 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 160, clientY: 130 });
    const after = frame(svg);
    expect(after[2]).toBeCloseTo(before[2]!, 5); // même cadrage
    expect([after[0], after[1]]).not.toEqual([before[0], before[1]]); // déplacé
  });

  it("deux doigts qui s'écartent : le plan s'agrandit", () => {
    const { container } = render(
      <Fr>
        <Harness log={() => {}} />
      </Fr>,
    );
    const svg = container.querySelector("svg")!;
    const before = frame(svg);
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(svg, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 320, clientY: 100 });
    fireEvent.pointerUp(svg, { pointerId: 2 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    expect(frame(svg)[2]).toBeLessThan(before[2]!);
  });
});
