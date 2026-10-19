import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { PromoCommand, PromoForm } from "@/app/o/[orgSlug]/events/[eventId]/promo/PromoForm";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ createPromoAction: vi.fn(), promoCommandAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).promo!;
// espace insécable de la ponctuation française : comparé après la même normalisation des deux côtés
const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const types = [
  { id: "t1", name: "Fosse", codeOnly: false },
  { id: "t2", name: "Invités", codeOnly: true },
];
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
const draw = (ticketTypes = types) => {
  render(
    <Fr>
      <PromoForm orgSlug="club" eventId="e1" ticketTypes={ticketTypes} currencySymbol="€" />
    </Fr>,
  );
  fireEvent.click(screen.getByRole("button", { name: `+ ${t.new}` }));
};
const type = (v: "PERCENT" | "AMOUNT" | "FREE") => fireEvent.change(document.getElementById("promo-type")!, { target: { value: v } });

describe("codes promo d'un événement", () => {
  it("champs selon le type : pourcentage, montant dans la devise, ou rien pour une gratuité", () => {
    draw();
    expect(document.getElementById("promo-percent")).not.toBeNull();
    type("AMOUNT");
    expect([!!document.getElementById("promo-amount"), !!document.getElementById("promo-percent")]).toEqual([true, false]);
    expect(screen.getByText(`${t.amount} (€)`)).toBeTruthy();
    type("FREE");
    expect([!!document.getElementById("promo-amount"), !!document.getElementById("promo-percent")]).toEqual([false, false]);
    expect(screen.getByText((c) => norm(c) === norm(t.freeHint!))).toBeTruthy();
  });

  it("déblocage des tarifs réservés aux codes : proposé seulement s'il en existe, et ces tarifs signalés", () => {
    draw();
    expect(screen.getByRole("checkbox", { name: t.unlocksHidden })).toBeTruthy();
    expect(screen.getByText((c) => c.includes(t.codeOnly!))).toBeTruthy();
    render(
      <Fr>
        <PromoForm orgSlug="club" eventId="e1" ticketTypes={[types[0]!]} currencySymbol="€" />
      </Fr>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: `+ ${t.new}` }).at(-1)!);
    expect(screen.getAllByRole("checkbox", { name: t.unlocksHidden })).toHaveLength(1); // seulement le premier formulaire
  });

  it("création : code, type, valeur et tarifs visés envoyés, puis le formulaire se referme", async () => {
    draw();
    fireEvent.change(document.getElementById("promo-code")!, { target: { value: "moins10" } });
    fireEvent.change(document.getElementById("promo-percent")!, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Fosse" }));
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.create }).closest("form")!));
    await waitFor(() => expect(actions.createPromoAction).toHaveBeenCalled());
    const data = actions.createPromoAction.mock.calls[0]!.at(-1) as FormData;
    expect([data.get("code"), data.get("discountType"), data.get("percent"), data.getAll("ticketTypeIds")]).toEqual(["moins10", "PERCENT", "10", ["t1"]]);
    await waitFor(() => expect(screen.getByRole("button", { name: `+ ${t.new}` })).toBeTruthy());
  });

  it("refus du serveur : erreur sous son champ, formulaire gardé ouvert", async () => {
    actions.createPromoAction.mockResolvedValue({ ok: false, error: "INVALID_INPUT", fields: { code: "validation.required" } });
    draw();
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.create }).closest("form")!));
    const v = fr.validation as Record<string, string>;
    await waitFor(() => expect(document.getElementById("promo-code-error")?.textContent).toBe(v.required ?? v.invalid));
    expect(screen.getByRole("button", { name: t.create })).toBeTruthy();
  });

  it("activer, désactiver ou supprimer un code : la bonne commande est envoyée", async () => {
    for (const command of ["activate", "deactivate", "delete"] as const) {
      const r = render(
        <Fr>
          <PromoCommand orgSlug="club" eventId="e1" promoId="p1" command={command} label={`action ${command}`} />
        </Fr>,
      );
      await act(async () => void fireEvent.submit(screen.getByRole("button", { name: `action ${command}` }).closest("form")!));
      await waitFor(() => expect(actions.promoCommandAction.mock.calls.at(-1)!.slice(0, 4)).toEqual(["club", "e1", "p1", command]));
      r.unmount();
    }
  });
});
