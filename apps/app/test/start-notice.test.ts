import { describe, expect, it } from "vitest";
import { formatStartWhen, parseStartNotice } from "@/server/startNotice";

const raw = (v: unknown) => encodeURIComponent(JSON.stringify(v));
const notice = {
  email: "Lea@Exemple.be",
  title: "Soirée de rentrée",
  startsAtLocal: "2027-02-20T20:00",
  place: "La Madeleine, Bruxelles",
};

describe("rappel de l'événement créé par /start sur la page de vérification", () => {
  it("même adresse (sans tenir compte des majuscules) : rappelé ; autre adresse : rien", () => {
    expect(parseStartNotice(raw(notice), "lea@exemple.be")).toEqual(notice);
    expect(parseStartNotice(raw(notice), "autre@exemple.be")).toBeNull();
    expect(parseStartNotice(undefined, "lea@exemple.be")).toBeNull();
  });

  it("cookie abîmé ou trafiqué : ignoré ; date mal formée : rappel sans date", () => {
    expect(parseStartNotice("%7Bpas-du-json", "lea@exemple.be")).toBeNull();
    expect(
      parseStartNotice(
        raw({ ...notice, title: "x".repeat(201) }),
        "lea@exemple.be",
      ),
    ).toBeNull();
    expect(
      parseStartNotice(
        raw({ ...notice, startsAtLocal: "demain" }),
        "lea@exemple.be",
      )!.startsAtLocal,
    ).toBe("");
  });

  it("date et heure saisies par l'organisateur, dans la langue de la page", () => {
    expect(formatStartWhen("2027-02-20T20:00", "fr")).toBe(
      "samedi 20 février 2027 à 20:00",
    );
    expect(formatStartWhen("", "fr")).toBe("");
  });
});
