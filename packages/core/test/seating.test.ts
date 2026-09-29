import { describe, expect, it } from "vitest";
import { pickSeats, seatLabels } from "../src";

const row = (r: number, map: string) => [...map].map((c, i) => ({ id: `${r}-${i + 1}`, rowOrder: r, seatOrder: i + 1, available: c === "." }));

describe("plan de salle : attribution des places (section 9.9)", () => {
  it("côte à côte dans le premier rang qui en a assez", () => {
    const seats = [...row(1, ".x.x."), ...row(2, "..x...")];
    expect(pickSeats(seats, 1)).toEqual(["1-1"]);
    expect(pickSeats(seats, 3)).toEqual(["2-4", "2-5", "2-6"]);
  });
  it("sinon les premières places libres ; null s'il n'y en a pas assez", () => {
    const seats = [...row(1, ".x."), ...row(2, "x.x")];
    expect(pickSeats(seats, 3)).toEqual(["1-1", "1-3", "2-2"]);
    expect(pickSeats(seats, 4)).toBeNull();
  });
  it("libellés automatiques ou manuels", () => {
    expect(seatLabels("4")).toEqual(["1", "2", "3", "4"]);
    expect(seatLabels("1, 2, 2 bis")).toEqual(["1", "2", "2 bis"]);
    expect(seatLabels("1, 1")).toBeNull();
    expect(seatLabels("0")).toBeNull();
  });
});
