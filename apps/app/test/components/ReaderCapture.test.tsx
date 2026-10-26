import { describe, expect, it } from "vitest";
import {
  createFieldReader,
  createKeyReader,
  type ReaderRead,
} from "@/components/scanner/readerCapture";

// lecteurs en mode clavier (douchettes, Zebra DataWedge, Honeywell…) : rythmes réels, horloge simulée
function clock() {
  let t = 0;
  let pending: { at: number; f: () => void } | null = null;
  return {
    now: () => t,
    setTimer: (f: () => void, ms: number) => (pending = { at: t + ms, f }),
    clearTimer: () => (pending = null),
    wait(ms: number) {
      t += ms;
      if (pending && pending.at <= t) {
        const p = pending;
        pending = null;
        p.f();
      }
    },
  };
}
const type = (
  r: { key: (k: string) => boolean },
  c: ReturnType<typeof clock>,
  text: string,
  gap: number,
) => {
  for (const ch of text) {
    r.key(ch);
    c.wait(gap);
  }
};

describe("lecture touche par touche (écoute du clavier)", () => {
  it("douchette rapide : Entrée, puis Tab, valident le code", () => {
    const c = clock();
    const reads: ReaderRead[] = [];
    const r = createKeyReader((x) => reads.push(x), c);
    type(r, c, "4006381333931", 8);
    expect(r.key("Enter")).toBe(true);
    type(r, c, "TM-12345", 8);
    expect(r.key("Tab")).toBe(true);
    expect(reads.map((x) => [x.code, x.how, x.end])).toEqual([
      ["4006381333931", "keys", "enter"],
      ["TM-12345", "keys", "tab"],
    ]);
  });

  it("sans touche de fin : validé par la pause, si au moins 6 caractères très rapides", () => {
    const c = clock();
    const reads: ReaderRead[] = [];
    const r = createKeyReader((x) => reads.push(x), c);
    type(r, c, "998877665544", 6);
    c.wait(130);
    type(r, c, "ABC12", 6); // trop court sans touche de fin
    c.wait(130);
    expect(reads.map((x) => [x.code, x.end])).toEqual([
      ["998877665544", "pause"],
    ]);
  });

  it("frappe humaine : rien n'est retenu, même avec Entrée ; code trop court : ignoré", () => {
    const c = clock();
    const reads: ReaderRead[] = [];
    const r = createKeyReader((x) => reads.push(x), c);
    type(r, c, "AAAAAA", 180);
    expect(r.key("Enter")).toBe(false);
    type(r, c, "AB1", 8);
    expect(r.key("Enter")).toBe(false);
    expect(r.key("Enter")).toBe(false); // Entrée seule (un bouton) : laissée au navigateur
    expect(reads).toEqual([]);
  });
});

describe("champ du mode lecteur", () => {
  it("code reçu d'un bloc (clavier d'Android) : validé par la pause, reconnu comme un bloc ; le champ est vidé", () => {
    const c = clock();
    const reads: ReaderRead[] = [];
    let cleared = 0;
    const r = createFieldReader(
      (x) => reads.push(x),
      () => cleared++,
      c,
    );
    r.input("4006381333931");
    c.wait(130);
    expect(reads.map((x) => [x.code, x.how, x.end])).toEqual([
      ["4006381333931", "block", "pause"],
    ]);
    expect(cleared).toBe(1);
  });

  it("touche par touche dans le champ : Entrée valide aussitôt, reconnu touche par touche", () => {
    const c = clock();
    const reads: ReaderRead[] = [];
    const r = createFieldReader(
      (x) => reads.push(x),
      () => undefined,
      c,
    );
    let value = "";
    for (const ch of "TM-998877") {
      r.key(ch);
      value += ch;
      r.input(value);
      c.wait(5);
    }
    expect(r.key("Enter")).toBe(true);
    expect(reads.map((x) => [x.code, x.how, x.end])).toEqual([
      ["TM-998877", "keys", "enter"],
    ]);
    expect(r.key("Enter")).toBe(false); // champ vide : rien
  });
});
