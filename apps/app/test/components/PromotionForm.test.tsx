import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromotionForm } from "@/app/admin/offres/PromotionForm";
import { emptyPromotion } from "@/app/admin/offres/values";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ savePromotionAction: vi.fn(), togglePromotionAction: vi.fn() }));
vi.mock("@/app/admin/offres/actions", () => actions);
beforeEach(() => {
  actions.savePromotionAction.mockReset();
  actions.savePromotionAction.mockResolvedValue({ ok: false, error: "INVALID_INPUT", fields: { code: "validation.invalid" } });
});

describe("formulaire d'une offre (administration)", () => {
  it("toutes les options et les textes des 7 langues ; valeurs par défaut prudentes", () => {
    render(
      <Fr>
        <PromotionForm id={null} values={emptyPromotion} />
      </Fr>,
    );
    for (const l of ["fr", "en", "nl", "de", "es", "it", "pt"]) expect(document.getElementById(`p-${l}-banner`)).not.toBeNull();
    expect((document.getElementById("p-duration") as HTMLInputElement).value).toBe("3");
    expect((document.getElementById("p-owner") as HTMLInputElement).value).toBe("1");
    expect((screen.getByRole("checkbox", { name: /Active/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole("checkbox", { name: /Associations|Entreprises|Particuliers|Organismes/ }).every((b) => !(b as HTMLInputElement).checked)).toBe(
      true,
    );
  });

  it("envoi : types d'organisation cochés et textes par langue ; erreur affichée sous son champ", async () => {
    render(
      <Fr>
        <PromotionForm id="p1" values={{ ...emptyPromotion, code: "rentree", name: "Rentrée" }} />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Associations/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Entreprises/ }));
    fireEvent.change(document.getElementById("p-nl-banner")!, { target: { value: "3 maanden gratis" } });
    await act(async () => void fireEvent.submit(document.getElementById("p-code")!.closest("form")!));
    await waitFor(() => expect(actions.savePromotionAction).toHaveBeenCalled());
    const [id, , data] = actions.savePromotionAction.mock.calls[0] as unknown as [string, unknown, FormData];
    expect([id, data.getAll("organizationTypes"), data.get("msg_nl_banner"), data.get("code"), data.get("planId")]).toEqual([
      "p1",
      ["ASSOCIATION", "COMPANY"],
      "3 maanden gratis",
      "rentree",
      "pro",
    ]);
    expect(await screen.findByText((c) => c.length > 0 && document.getElementById("p-code-error")?.textContent === c)).toBeTruthy();
  });
});
