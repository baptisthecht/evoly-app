import { bestSeats } from "@evoly/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
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

describe("choix des places sur le plan (section 9.9)", () => {
  it("meilleures places : exactement celles de la règle commune au serveur, décrites à l'acheteur", () => {
    const log = draw();
    const plan = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `s${n}`,
      rowId: "r1",
      order: n,
      x: (n - 1) * 30,
      y: 0,
      available: true,
    }));
    const expected = bestSeats(plan, 2, { x: 75, y: -100 })!;
    expect(log).toHaveBeenLastCalledWith(expected, true);
    expect(screen.getByRole("status").textContent).toContain("A");
  });

  it("choix sur le plan au clavier ; quand le compte est atteint, la plus ancienne place est remplacée", () => {
    const log = draw({ fixedMode: "map" });
    press(1);
    press(2);
    expect(log).toHaveBeenLastCalledWith(["s1", "s2"], true);
    press(4);
    expect(log.mock.calls.at(-1)![0]).toEqual(["s2", "s4"]);
  });

  it("place laissée seule : refusée avec un message, si un autre choix l'évite", () => {
    const log = draw({ fixedMode: "map" });
    press(2);
    press(3); // la place 1 reste seule au bout du rang
    expect(log).toHaveBeenLastCalledWith(["s2", "s3"], false);
    expect(screen.getByRole("alert").textContent).toBe(sp.orphan);
  });

  it("place déjà prise : jamais sélectionnable ; « effacer » vide le choix", () => {
    const log = draw({ fixedMode: "map", taken: [3] });
    expect(screen.queryByRole("button", { name: label(3, "free") })).toBeNull();
    press(1);
    fireEvent.click(screen.getByRole("button", { name: sp.clear }));
    expect(log).toHaveBeenLastCalledWith([], true);
  });

  it("une place choisie se retire en la touchant à nouveau", () => {
    const log = draw({ fixedMode: "map" });
    press(5);
    press(5, "selected");
    expect(log).toHaveBeenLastCalledWith([], true);
  });

  it("simple consultation : rien de modifiable, aucun choix proposé", () => {
    const log = draw({ fixedMode: "view" });
    expect(screen.queryByRole("button", { name: label(1, "free") })).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("choix des places : zoom du plan", () => {
  it("« + » resserre le cadrage, « − » au minimum ne va pas au-delà du plan entier, « Tout voir » revient au départ", () => {
    const { container } = render(
      <Fr>
        <Harness log={() => {}} />
      </Fr>,
    );
    const frame = () =>
      container
        .querySelector("svg")!
        .getAttribute("viewBox")!
        .split(/\s+/)
        .map(Number);
    const start = frame();
    const width = (f: number[]) => f[2]!;
    fireEvent.click(screen.getByRole("button", { name: sp.zoomIn! }));
    expect(width(frame())).toBeLessThan(width(start)); // plus près
    fireEvent.click(screen.getByRole("button", { name: sp.zoomOut! }));
    fireEvent.click(screen.getByRole("button", { name: sp.zoomOut! }));
    expect(width(frame())).toBeCloseTo(width(start), 5); // jamais plus loin que le plan entier
    fireEvent.click(screen.getByRole("button", { name: sp.zoomIn! }));
    fireEvent.click(screen.getByRole("button", { name: sp.fit! }));
    expect(frame()).toEqual(start);
  });
});
