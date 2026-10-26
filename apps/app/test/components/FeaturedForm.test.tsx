import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { FeaturedForm } from "@/app/o/[orgSlug]/settings/FeaturedForm";
import { Fr } from "./intl";

// vitrine de l'organisateur : l'événement mis en avant se choisit dans les paramètres
vi.mock("@/app/o/[orgSlug]/settings/actions", () => ({
  saveFeaturedAction: vi.fn(),
}));
const t = (fr as unknown as Record<string, Record<string, string>>)
  .orgSettings!;
const events = [
  {
    id: "e1",
    title: "Gala de printemps",
    startsAt: "2027-04-17T18:00:00.000Z",
    timezone: "Europe/Brussels",
  },
  {
    id: "e2",
    title: "Bal swing",
    startsAt: "2027-05-16T18:00:00.000Z",
    timezone: "Europe/Brussels",
  },
];
const view = (o: Partial<Parameters<typeof FeaturedForm>[0]> = {}) =>
  render(
    <Fr>
      <FeaturedForm
        orgSlug="club"
        readOnly={false}
        mode="NEXT"
        eventId={null}
        fallback={false}
        events={events}
        {...o}
      />
    </Fr>,
  );

describe("réglage de l'événement mis en avant", () => {
  it("la liste des événements n'apparaît qu'avec « Un événement choisi »", () => {
    view();
    expect(screen.queryByLabelText(t.featuredEvent!)).toBeNull();
    fireEvent.click(
      screen.getByLabelText((c) => c.startsWith(t.featured_CHOSEN!)),
    );
    const select = screen.getByLabelText(t.featuredEvent!) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["e1", "e2"]);
  });

  it("événement choisi devenu indisponible : le retour au prochain est signalé ; lecture seule : rien ne se modifie", () => {
    view({ mode: "CHOSEN", eventId: "gone", fallback: true, readOnly: true });
    expect(screen.getByRole("status").textContent).toBe(t.featuredFallback);
    // tout le formulaire est verrouillé par son groupe (le navigateur bloque chaque contrôle)
    const radio = screen.getByLabelText((c) => c.startsWith(t.featured_NONE!));
    expect(radio.closest("fieldset")!.disabled).toBe(true);
  });
});
