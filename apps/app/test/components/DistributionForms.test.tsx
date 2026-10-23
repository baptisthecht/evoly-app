import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  AddDistributorForm,
  AllocationForm,
  PrecreatedCodesForm,
  ReleaseUnsoldButton,
} from "@/app/o/[orgSlug]/events/[eventId]/distribution/DistributionForms";
import { Fr } from "./intl";

// réseaux de vente : ajout d'un réseau, places confiées par tarif, rendre les invendus (docs/COMPATIBILITE_RESEAUX.md)
const actions = vi.hoisted(() => ({
  createDistributorAction: vi.fn(),
  setAllocationAction: vi.fn(),
  releaseUnsoldAction: vi.fn(),
  createPrecreatedCodesAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).distribution!;
const errors = (fr as unknown as Record<string, Record<string, string>>).formErrors!;
const sent = (fn: ReturnType<typeof vi.fn>) => Object.fromEntries((fn.mock.calls.at(-1)!.at(-1) as FormData).entries());
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});

describe("réseaux de vente : formulaires", () => {
  it("ajout d'un réseau : la sorte de réseau et le nom choisis sont envoyés", async () => {
    actions.createDistributorAction.mockResolvedValue({ ok: true, data: null });
    render(
      <Fr>
        <AddDistributorForm
          orgSlug="club"
          eventId="e1"
          kinds={[
            { value: "TICKETMASTER", label: "Ticketmaster" },
            { value: "BILLETREDUC", label: "BilletReduc" },
          ]}
        />
      </Fr>,
    );
    fireEvent.change(screen.getByLabelText(t.kind!), { target: { value: "BILLETREDUC" } });
    fireEvent.change(screen.getByLabelText(new RegExp(t.name!)), { target: { value: "BilletReduc Paris" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.add })));
    await waitFor(() => expect(actions.createDistributorAction).toHaveBeenCalled());
    expect(sent(actions.createDistributorAction)).toMatchObject({ kind: "BILLETREDUC", name: "BilletReduc Paris" });
    expect(await screen.findByText(t.added!)).toBeTruthy();
  });

  it("places confiées : quantité envoyée avec le réseau et le tarif ; refus du serveur expliqué", async () => {
    actions.setAllocationAction.mockResolvedValue({ ok: false, error: "ALLOCATION_EXCEEDS_STOCK" });
    render(
      <Fr>
        <AllocationForm
          orgSlug="club"
          eventId="e1"
          ticketTypeId="t1"
          distributorId="d1"
          distributorName="Ticketmaster"
          quantity={4}
          imported={2}
          disabled={false}
        />
      </Fr>,
    );
    expect(screen.getByText(t.importedHint!.replace("{count, plural, one {# billet importé} other {# billets importés}}", "2 billets importés"))).toBeTruthy();
    const field = screen.getByLabelText(/Ticketmaster/) as HTMLInputElement;
    expect(field.value).toBe("4");
    fireEvent.change(field, { target: { value: "30" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.save })));
    await waitFor(() => expect(actions.setAllocationAction).toHaveBeenCalled());
    expect(sent(actions.setAllocationAction)).toEqual({ distributorId: "d1", ticketTypeId: "t1", quantity: "30" });
    expect(await screen.findByText(errors.ALLOCATION_EXCEEDS_STOCK!)).toBeTruthy();
  });

  it("sans le droit de modifier : quantité en lecture seule, pas de bouton", () => {
    render(
      <Fr>
        <AllocationForm orgSlug="club" eventId="e1" ticketTypeId="t1" distributorId="d1" distributorName="Ticketmaster" quantity={4} imported={0} disabled />
      </Fr>,
    );
    expect((screen.getByLabelText(/Ticketmaster/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: t.save })).toBeNull();
  });

  it("rendre les invendus : annulé à la confirmation, rien ne part ; accepté, les places rendues sont annoncées", async () => {
    actions.releaseUnsoldAction.mockResolvedValue({ ok: true, data: { released: 4 } });
    render(
      <Fr>
        <ReleaseUnsoldButton orgSlug="club" eventId="e1" distributorId="d1" count={4} />
      </Fr>,
    );
    const button = screen.getByRole("button", { name: "Rendre les invendus (4)" });
    vi.stubGlobal("confirm", () => false);
    fireEvent.submit(button.closest("form")!);
    expect(actions.releaseUnsoldAction).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", () => true);
    await act(async () => void fireEvent.submit(button.closest("form")!));
    await waitFor(() => expect(actions.releaseUnsoldAction).toHaveBeenCalled());
    expect(await screen.findByText("4 places rendues à la vente en ligne.")).toBeTruthy();
  });

  it("codes créés à l'avance : tarif et nombre envoyés ; codes créés annoncés ; lien du CSV pour le réseau", async () => {
    actions.createPrecreatedCodesAction.mockResolvedValue({ ok: true, data: { created: 30 } });
    render(
      <Fr>
        <PrecreatedCodesForm orgSlug="club" eventId="e1" distributorId="br" ticketTypes={[{ id: "t1", name: "Plein tarif", free: 40 }]} existing={0} />
      </Fr>,
    );
    expect(screen.getByRole("option", { name: "Plein tarif (40 places libres)" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull(); // aucun code encore
    fireEvent.change(screen.getByLabelText(t.codesCount!), { target: { value: "30" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.codesCreate })));
    await waitFor(() => expect(actions.createPrecreatedCodesAction).toHaveBeenCalled());
    expect(sent(actions.createPrecreatedCodesAction)).toEqual({ distributorId: "br", ticketTypeId: "t1", count: "30" });
    expect(await screen.findByText("30 codes créés.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Télécharger les codes (30, CSV)" }).getAttribute("href")).toBe(
      "/o/club/events/e1/distribution/codes?distributor=br",
    );
  });
});
