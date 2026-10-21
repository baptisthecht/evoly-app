import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { UploadForm } from "@/app/admin/prospection/UploadForm";
import { AmbassadorForm } from "@/app/o/[orgSlug]/events/[eventId]/ambassadors/AmbassadorForm";
import { ComplimentaryForm } from "@/app/o/[orgSlug]/events/[eventId]/tickets/ComplimentaryForm";
import { Fr } from "./intl";

// petits formulaires : ajout d'un ambassadeur, billets offerts, import d'un lot de prospection
const events = vi.hoisted(() => ({
  createAmbassadorAction: vi.fn(),
  ambassadorCommandAction: vi.fn(),
  ambassadorPromoAction: vi.fn(),
  complimentaryAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => events);
const prospection = vi.hoisted(() => ({ importLotAction: vi.fn() }));
vi.mock("@/app/admin/prospection/actions", () => prospection);
const msg = fr as unknown as Record<string, Record<string, string>>;
const flat = () => document.body.textContent!.replace(/\s+/g, " ");
beforeEach(() => {
  for (const f of [...Object.values(events), prospection.importLotAction]) f.mockReset();
});

describe("ajout d'un ambassadeur", () => {
  it("nom, e-mail et objectif transmis à l'action ; confirmation affichée", async () => {
    events.createAmbassadorAction.mockResolvedValue({ ok: true });
    render(
      <Fr>
        <AmbassadorForm orgSlug="club" eventId="e1" />
      </Fr>,
    );
    fireEvent.change(document.getElementById("amb-name")!, { target: { value: "Léa Ambassadrice" } });
    fireEvent.change(document.getElementById("amb-email")!, { target: { value: "lea@exemple.be" } });
    fireEvent.change(document.getElementById("amb-goal")!, { target: { value: "20" } });
    fireEvent.submit(document.getElementById("amb-name")!.closest("form")!);
    await waitFor(() => expect(events.createAmbassadorAction).toHaveBeenCalled());
    const [org, event, , form] = events.createAmbassadorAction.mock.calls[0] as [string, string, unknown, FormData];
    expect([org, event, form.get("name"), form.get("email"), form.get("goal")]).toEqual(["club", "e1", "Léa Ambassadrice", "lea@exemple.be", "20"]);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText(msg.ambassadors!.saved!)).toBeTruthy();
  });
});

describe("billets offerts", () => {
  it("destinataires, tarif et quantité transmis ; compte rendu avec le destinataire refusé", async () => {
    events.complimentaryAction.mockResolvedValue({
      ok: true,
      data: {
        results: [
          { email: "lea@exemple.be", ok: true },
          { email: "tom@", ok: false, error: "QUELQUE_CHOSE" },
        ],
        invalid: [{ line: 3, value: "pas une adresse" }],
      },
    });
    render(
      <Fr>
        <ComplimentaryForm
          orgSlug="club"
          eventId="e1"
          ticketTypes={[
            { id: "t1", name: "Fosse" },
            { id: "t2", name: "Balcon" },
          ]}
        />
      </Fr>,
    );
    fireEvent.change(document.getElementById("comp-recipients")!, { target: { value: "lea@exemple.be\ntom@" } });
    fireEvent.change(document.getElementById("comp-type")!, { target: { value: "t2" } });
    fireEvent.change(document.getElementById("comp-qty")!, { target: { value: "2" } });
    fireEvent.submit(document.getElementById("comp-recipients")!.closest("form")!);
    await waitFor(() => expect(events.complimentaryAction).toHaveBeenCalled());
    const form = (events.complimentaryAction.mock.calls[0] as unknown[])[3] as FormData;
    expect([form.get("recipients"), form.get("ticketTypeId"), form.get("quantityEach")]).toEqual(["lea@exemple.be\ntom@", "t2", "2"]);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(flat()).toContain(`tom@ : ${msg.complimentary!.failed}`);
    expect(flat()).toContain("pas une adresse"); // ligne illisible signalée
  });
});

describe("import d'un lot de prospection", () => {
  it("compte rendu : importés, programmés, en attente, par jour, par boîte, ignorés ; erreur affichée", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    prospection.importLotAction.mockResolvedValueOnce({ ok: false, error: "JSON illisible" }).mockResolvedValueOnce({
      ok: true,
      report: {
        ajoutes: 3,
        lot: "lot-octobre",
        programmes: 2,
        enAttente: 1,
        misAJour: 1,
        parJour: [{ jour: today, count: 2 }],
        parBoite: [{ address: "baptiste@exemple.be", count: 2 }],
        ignores: [{ id: "p9", a: "x@invalide", raison: "adresse invalide" }],
      },
    });
    render(<UploadForm />);
    const form = document.querySelector("form")!;
    fireEvent.change(form.querySelector("textarea")!, { target: { value: '{ "emails": [] }' } });
    fireEvent.submit(form);
    expect((await screen.findByRole("alert")).textContent).toBe("JSON illisible");
    fireEvent.submit(form);
    await screen.findByRole("status");
    const text = flat();
    expect(text).toContain("3 e-mail(s) importé(s) dans le lot lot-octobre : 2 programmé(s), 1 en attente (aucune boîte active).");
    expect(text).toContain("1 e-mail(s) pas encore parti(s) mis à jour avec le nouveau texte.");
    expect(text).toContain("aujourd'hui : 2");
    expect(text).toContain("baptiste@exemple.be : 2");
    expect(text).toContain("Ignoré : x@invalide (p9), adresse invalide");
  });
});
