import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { QuickStartForm } from "@/app/(auth)/start/QuickStartForm";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ quickStartAction: vi.fn() }));
vi.mock("@/app/(auth)/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).quickstart!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
beforeEach(() => {
  actions.quickStartAction.mockReset();
  actions.quickStartAction.mockResolvedValue({ ok: false, error: "EMAIL_TAKEN" });
});
const fillEvent = () => {
  fireEvent.change(document.getElementById("qs-title")!, { target: { value: "Soirée de rentrée" } });
  fireEvent.change(document.getElementById("qs-starts")!, { target: { value: "2027-02-20T20:00" } });
  fireEvent.change(document.getElementById("qs-place")!, { target: { value: "Salle des fêtes" } });
  fireEvent.change(document.getElementById("qs-city")!, { target: { value: "Namur" } });
  fireEvent.change(document.getElementById("qs-price")!, { target: { value: "0" } });
  fireEvent.change(document.getElementById("qs-quantity")!, { target: { value: "150" } });
};

describe("création rapide (visiteurs des annonces)", () => {
  it("le second écran n'arrive qu'avec un événement complet", () => {
    render(
      <Fr>
        <QuickStartForm />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(document.getElementById("qs-email")).toBeNull();
    fillEvent();
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(document.getElementById("qs-email")).not.toBeNull();
  });

  it("aperçu de l'événement, ses valeurs envoyées avec le compte ; « modifier » ramène au premier écran", async () => {
    render(
      <Fr>
        <QuickStartForm />
      </Fr>,
    );
    fillEvent();
    fireEvent.click(screen.getByRole("button", { name: t.next }));
    const preview = screen.getByRole("region", { name: t.almost });
    expect(norm(preview.textContent!)).toContain("Soirée de rentrée");
    expect(norm(preview.textContent!)).toContain("Salle des fêtes, Namur");
    expect(norm(preview.textContent!)).toContain(t.free!);
    fireEvent.change(document.getElementById("qs-org")!, { target: { value: "Club Jeunesse" } });
    fireEvent.change(document.getElementById("qs-email")!, { target: { value: "nora@exemple.be" } });
    fireEvent.change(document.getElementById("qs-password")!, { target: { value: "Motdepasse-2026!" } });
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
    ]).toEqual(["Soirée de rentrée", "2027-02-20T20:00", "Namur", "0", "150", "Club Jeunesse", "ASSOCIATION", "on"]);
    expect(await screen.findByRole("link", { name: t.login })).toBeTruthy(); // e-mail déjà utilisé : se connecter
    fireEvent.click(screen.getByRole("button", { name: t.back }));
    expect((document.getElementById("qs-title") as HTMLInputElement).value).toBe("Soirée de rentrée");
  });
});
