import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { QuickStartForm } from "@/app/start/QuickStartForm";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ quickStartAction: vi.fn() }));
vi.mock("@/app/(auth)/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).quickstart!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const change = (id: string, value: string) => fireEvent.change(document.getElementById(id)!, { target: { value } });
beforeEach(() => {
  actions.quickStartAction.mockReset();
  actions.quickStartAction.mockResolvedValue({ ok: false, error: "EMAIL_TAKEN" });
});
const fillRequired = () => {
  change("qs-title", "Soirée de rentrée");
  change("qs-date", "2027-02-20");
  change("qs-time", "20:00");
  change("qs-place", "Salle des fêtes");
  change("qs-city", "Namur");
};

describe("création rapide (visiteurs des annonces)", () => {
  it("le compte n'arrive qu'avec les 4 champs obligatoires ; barre « Tout est prêt » ; prix et places vides : gratuit et illimité", () => {
    render(
      <Fr>
        <QuickStartForm offer={null} />
      </Fr>,
    );
    expect(screen.getByText(t.progress!.replace("{n}", "0"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(document.getElementById("qs-email")).toBeNull();
    fillRequired();
    expect(screen.getByText(t.ready!)).toBeTruthy();
    const preview = norm(screen.getAllByRole("region", { name: t.preview })[1]!.textContent!);
    expect(preview).toContain("Soirée de rentrée");
    expect(preview).toContain("Salle des fêtes, Namur");
    expect(preview).toContain(t.free!);
    expect(preview).toContain(t.unlimited!);
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(document.getElementById("qs-email")).not.toBeNull();
  });

  it("compte : valeurs de l'événement envoyées (date et heure réunies, prix et places vides), type choisi ; e-mail déjà utilisé ; retour sans rien perdre", async () => {
    render(
      <Fr>
        <QuickStartForm offer={null} />
      </Fr>,
    );
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    change("qs-org", "Club Jeunesse");
    fireEvent.click(screen.getByRole("button", { name: t.type_COMPANY }));
    change("qs-email", "nora@exemple.be");
    change("qs-password", "Motdepasse-2026!");
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => void fireEvent.submit(document.getElementById("qs-email")!.closest("form")!));
    await waitFor(() => expect(actions.quickStartAction).toHaveBeenCalled());
    const data = actions.quickStartAction.mock.calls[0]!.at(-1) as FormData;
    expect([
      data.get("title"),
      data.get("startsAtLocal"),
      data.get("city"),
      data.get("price"),
      data.get("quantity"),
      data.get("orgName"),
      data.get("type"),
      data.get("terms"),
    ]).toEqual(["Soirée de rentrée", "2027-02-20T20:00", "Namur", "", "", "Club Jeunesse", "COMPANY", "on"]);
    expect(await screen.findByRole("link", { name: t.login })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.back }));
    expect((document.getElementById("qs-title") as HTMLInputElement).value).toBe("Soirée de rentrée");
  });

  it("offre en cours : annoncée à l'étape du compte ; aperçu en brouillon au nom de l'organisation", () => {
    render(
      <Fr>
        <QuickStartForm offer="3 mois de Pro offerts, sans carte bancaire." />
      </Fr>,
    );
    expect(screen.queryByRole("note")).toBeNull();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(screen.getByRole("note").textContent).toBe("3 mois de Pro offerts, sans carte bancaire.");
    change("qs-org", "Club Jeunesse");
    const preview = norm(screen.getByRole("region", { name: t.preview }).textContent!);
    expect(preview).toContain("club-jeunesse.evoly.me/soiree-de-rentree");
    expect(preview).toContain(t.draft!);
  });
});
