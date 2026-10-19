import { EUR_TERMS } from "@evoly/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { TiersEditor, type TierRow } from "@/app/o/[orgSlug]/events/[eventId]/tickets/TiersEditor";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ saveTiersAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const all = fr as unknown as Record<string, Record<string, string>>;
const t = all.tiers!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const tier = (over: Partial<TierRow> = {}): TierRow => ({
  id: "p1",
  name: "Prévente",
  price: "20",
  startsAtLocal: "",
  endsAtLocal: "",
  quantityLimit: "",
  sold: 0,
  ...over,
});
beforeEach(() => {
  actions.saveTiersAction.mockReset();
  actions.saveTiersAction.mockResolvedValue({ ok: true, data: { issues: [] } });
});
const draw = (over: { initial?: TierRow[]; enabled?: boolean; locked?: boolean } = {}) =>
  render(
    <Fr>
      <TiersEditor
        orgSlug="club"
        eventId="e1"
        ticketTypeId="tt1"
        initial={over.initial ?? []}
        enabled={over.enabled ?? true}
        locked={over.locked ?? false}
        terms={EUR_TERMS.pro}
      />
    </Fr>,
  );
const button = (name: string) => screen.queryByRole("button", { name }) as HTMLButtonElement | null;

describe("paliers de prix (US-TKT-03, Pro)", () => {
  it("sans l'offre Pro et sans palier : seulement la présentation de la fonction", () => {
    const { container } = draw({ enabled: false });
    expect(container.textContent).toContain(t.proPitch!);
    expect(button(t.add!)).toBeNull();
  });

  it("passée en Free : paliers gardés en lecture seule, aucune modification possible", () => {
    const { container } = draw({ enabled: false, initial: [tier()] });
    expect(container.textContent).toContain(t.keptAfterDowngrade!);
    expect((screen.getByDisplayValue("Prévente") as HTMLInputElement).readOnly).toBe(true);
    expect([button(t.add!), button(t.save!), button(t.remove!)]).toEqual([null, null, null]);
  });

  it("paliers verrouillés : même lecture seule, avec sa mention", () => {
    const { container } = draw({ locked: true, initial: [tier()] });
    expect(container.textContent).toContain(t.lockedBadge!);
    expect(button(t.save!)).toBeNull();
  });

  it("un palier vendu ne se supprime pas ; un palier sans vente, si", () => {
    draw({ initial: [tier({ id: "p1", name: "Prévente", sold: 12 }), tier({ id: "p2", name: "Normal", sold: 0 })] });
    expect(screen.getAllByRole("button", { name: t.remove })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: t.remove }));
    expect(screen.queryByDisplayValue("Normal")).toBeNull();
    expect(screen.getByDisplayValue("Prévente")).toBeTruthy();
  });

  it("au plus 10 paliers", () => {
    draw({ initial: Array.from({ length: 9 }, (_, i) => tier({ id: `p${i}`, name: `P${i}` })) });
    fireEvent.click(button(t.add!)!);
    expect(button(t.add!)!.disabled).toBe(true);
  });

  it("enregistrement : champs vides envoyés comme absents, puis confirmé", async () => {
    draw({ initial: [tier({ startsAtLocal: "2026-10-01T10:00" })] });
    await act(async () => void fireEvent.click(button(t.save!)!));
    expect(actions.saveTiersAction).toHaveBeenCalledWith("club", "e1", "tt1", [
      { id: "p1", name: "Prévente", price: "20", startsAtLocal: "2026-10-01T10:00", endsAtLocal: null, quantityLimit: null },
    ]);
    expect(await screen.findByText(t.saved!)).toBeTruthy();
  });

  it("trou entre deux paliers : signalé avec ses dates ; refus : traduit", async () => {
    const from = "2026-10-10T10:00:00.000Z";
    const to = "2026-10-12T10:00:00.000Z";
    actions.saveTiersAction.mockResolvedValue({ ok: true, data: { issues: [{ kind: "GAP", from, to }] } });
    draw({ initial: [tier()] });
    await act(async () => void fireEvent.click(button(t.save!)!));
    const fmt = (iso: string) => new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    expect(await screen.findByText((c) => norm(c).includes(norm(fmt(from))) && norm(c).includes(norm(fmt(to))))).toBeTruthy();
    actions.saveTiersAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    await act(async () => void fireEvent.click(button(t.save!)!));
    await waitFor(() => expect(screen.getByText((fr.formErrors as Record<string, string>).generic!)).toBeTruthy());
  });
});
