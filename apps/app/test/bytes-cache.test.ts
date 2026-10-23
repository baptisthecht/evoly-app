import { describe, expect, it } from "vitest";
import { createBytesCache } from "@/lib/bytesCache";

const b = (n: number) => new Uint8Array(n);

describe("cache des PDF limité en octets (RG-FILE-02)", () => {
  it("le plus récemment utilisé passe en dernier : il sort le plus tard", () => {
    const c = createBytesCache(12);
    c.set("a", b(4));
    c.set("b", b(4));
    c.set("c", b(4));
    c.get("a"); // « a » relu : « b » devient le plus ancien
    c.set("d", b(4));
    expect([
      c.get("a") !== undefined,
      c.get("b") !== undefined,
      c.get("c") !== undefined,
      c.get("d") !== undefined,
    ]).toEqual([true, false, true, true]);
  });

  it("les plus anciens sortent dès que la limite est dépassée", () => {
    const c = createBytesCache(10);
    c.set("a", b(4));
    c.set("b", b(4));
    c.set("c", b(4));
    expect([c.size, c.bytes, c.get("a")]).toEqual([2, 8, undefined]);
  });

  it("un seul élément plus gros que la limite est gardé, jusqu'à l'arrivée du suivant", () => {
    const c = createBytesCache(10);
    c.set("gros", b(20));
    expect([c.size, c.bytes]).toEqual([1, 20]);
    c.set("petit", b(2));
    expect([c.size, c.bytes, c.get("gros")]).toEqual([1, 2, undefined]);
  });

  it("une même clé enregistrée deux fois n'est comptée qu'une fois", () => {
    const c = createBytesCache(100);
    c.set("a", b(30));
    c.set("a", b(40));
    expect([c.size, c.bytes, c.get("a")!.length]).toEqual([1, 40, 40]);
  });

  it("réussites et échecs comptés", () => {
    const c = createBytesCache(100);
    expect(c.get("absent")).toBeUndefined();
    c.set("a", b(1));
    c.get("a");
    c.get("a");
    expect(c.stats).toEqual({ hits: 2, misses: 1 });
  });
});
