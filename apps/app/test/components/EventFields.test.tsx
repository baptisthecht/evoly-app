import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EventFields, type EventFieldValues, type PartnerVenueOption } from "@/components/events/EventFields";
import { Fr } from "./intl";

const ev = fr.events as unknown as Record<string, string>; // espace de traduction avec des sous-objets (statuts…)
const values = (over: Partial<EventFieldValues> = {}): EventFieldValues => ({
  title: "Gala",
  summary: "",
  startsAtLocal: "2026-11-20T20:00",
  endsAtLocal: "",
  timezone: "Europe/Brussels",
  locationType: "PHYSICAL",
  locationName: "",
  addressLine1: "",
  postalCode: "",
  city: "",
  country: "BE",
  onlineUrl: "",
  ...over,
});
const venue: PartnerVenueOption = { name: "La Rotonde", addressLine1: "Rue Haute 1", postalCode: "1000", city: "Bruxelles" };
const draw = (v: EventFieldValues = values(), opts: { venue?: PartnerVenueOption; error?: (n: string) => string | null } = {}) =>
  render(
    <Fr>
      <form>
        <EventFields values={v} venue={opts.venue} error={opts.error ?? (() => null)} />
      </form>
    </Fr>,
  );
const address = () => screen.queryByLabelText(new RegExp(ev.address!));
const online = () => screen.queryByLabelText(new RegExp(ev.onlineUrl!));
const pick = (type: "PHYSICAL" | "ONLINE" | "HYBRID") => fireEvent.click(screen.getByLabelText(ev[`locationType_${type}`]!));

describe("informations d'un événement : champs du lieu (section 9.6)", () => {
  it("sur place : l'adresse, sans lien en ligne ; en ligne : le lien, sans adresse ; hybride : les deux", () => {
    draw();
    expect([!!address(), !!online()]).toEqual([true, false]);
    pick("ONLINE");
    expect([!!address(), !!online()]).toEqual([false, true]);
    pick("HYBRID");
    expect([!!address(), !!online()]).toEqual([true, true]);
  });

  it("salle partenaire : case cochée par défaut, son adresse affichée à la place des champs ; décochée : les champs reviennent", () => {
    const { container } = draw(values(), { venue });
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(container.textContent).toContain("Rue Haute 1, 1000 Bruxelles");
    expect(address()).toBeNull();
    fireEvent.click(box);
    expect(address()).not.toBeNull();
  });

  it("salle partenaire refusée auparavant : case décochée, adresse à saisir", () => {
    draw(values({ atVenue: false }), { venue });
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(address()).not.toBeNull();
  });

  it("événement en ligne : la salle partenaire n'est pas proposée", () => {
    draw(values({ locationType: "ONLINE" }), { venue });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("fuseau horaire hors liste déjà enregistré : gardé en tête de liste, lisible", () => {
    draw(values({ timezone: "America/New_York" }));
    const select = screen.getByLabelText(new RegExp(ev.timezone!)) as HTMLSelectElement;
    expect([select.value, select.options[0]!.textContent]).toEqual(["America/New_York", "America/New York"]);
  });

  it("erreurs affichées sous leur champ, et le champ signalé", () => {
    draw(values(), { error: (n) => (n === "title" ? "Obligatoire." : null) });
    expect(screen.getByText("Obligatoire.")).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(ev.title!)).getAttribute("aria-invalid")).toBe("true");
  });
});
