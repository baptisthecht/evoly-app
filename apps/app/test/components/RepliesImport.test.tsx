import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepliesImport } from "@/app/admin/prospection/RepliesImport";

// administration : import des réponses des prospects, aperçu puis application
const actions = vi.hoisted(() => ({
  previewRepliesAction: vi.fn(),
  applyRepliesAction: vi.fn(),
}));
vi.mock("@/app/admin/prospection/actions", () => actions);
const labels = {
  CONTACTE: "Contacté, en attente de réponse",
  RDV: "Démo ou rendez-vous prévu",
  CLIENT: "Client",
  PAS_INTERESSE: "Pas intéressé",
};
const plan = (rows: unknown[], counts: Record<string, number>) => ({
  ok: true,
  step: "preview",
  fileName: "reponses.csv",
  plan: {
    rows,
    counts: {
      change: 0,
      note: 0,
      same: 0,
      protected: 0,
      unknown: 0,
      invalid: 0,
      ...counts,
    },
  },
});
const file = new File(["email;statut\n"], "reponses.csv", { type: "text/csv" });
beforeEach(() => {
  actions.previewRepliesAction.mockReset();
  actions.applyRepliesAction.mockReset();
});
async function read() {
  render(<RepliesImport labels={labels} />);
  fireEvent.change(screen.getByLabelText("Fichier des réponses"), {
    target: { files: [file] },
  });
  await act(
    async () =>
      void fireEvent.click(
        screen.getByRole("button", { name: "Lire le fichier" }),
      ),
  );
}

describe("import des réponses des prospects", () => {
  it("aperçu ligne par ligne, statuts en clair et raisons ; appliquer renvoie le même fichier, puis le bilan", async () => {
    actions.previewRepliesAction.mockResolvedValue(
      plan(
        [
          {
            line: 2,
            email: "contact@auxbellespoules.fr",
            organisation: "Aux Belles Poules",
            current: "CONTACTE",
            next: "RDV",
            action: "change",
            note: "Présentation samedi",
            date: "2026-10-26",
            followUp: null,
          },
          {
            line: 3,
            email: "ancien@exemple.fr",
            organisation: "Ancien client",
            current: "CLIENT",
            next: "PAS_INTERESSE",
            action: "protected",
            reason: "CLIENT",
            note: null,
            date: null,
            followUp: null,
          },
        ],
        { change: 1, protected: 1 },
      ),
    );
    actions.applyRepliesAction.mockResolvedValue({
      ok: true,
      step: "applied",
      fileName: "reponses.csv",
      counts: {
        change: 1,
        note: 0,
        same: 0,
        protected: 1,
        unknown: 0,
        invalid: 0,
      },
    });
    await read();
    expect(actions.previewRepliesAction.mock.calls[0]![1].get("fichier")).toBe(
      file,
    );
    expect(
      screen.getByText(
        "Contacté, en attente de réponse → Démo ou rendez-vous prévu",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/déjà client, jamais rétrogradé/)).toBeTruthy();
    const apply = screen.getByRole("button", { name: "Appliquer (2 lignes)" });
    await act(async () => void fireEvent.click(apply));
    expect(actions.applyRepliesAction.mock.calls[0]![1].get("fichier")).toBe(
      file,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Import appliqué : 1 statut(s) changé(s), 1 note(s) ajoutée(s).",
    );
    expect(
      screen
        .getByRole("link", { name: "Voir les prospects" })
        .getAttribute("href"),
    ).toBe("/admin/prospection/prospects");
  });

  it("rien à appliquer : bouton inactif ; erreur du fichier expliquée", async () => {
    actions.previewRepliesAction.mockResolvedValueOnce(
      plan(
        [
          {
            line: 2,
            email: "x@inconnu.fr",
            organisation: null,
            current: null,
            next: "RDV",
            action: "unknown",
            note: null,
            date: null,
            followUp: null,
          },
        ],
        { unknown: 1 },
      ),
    );
    await read();
    expect(
      (
        screen.getByRole("button", {
          name: "Appliquer (0 ligne)",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    actions.previewRepliesAction.mockResolvedValueOnce({
      ok: false,
      error:
        "Il manque la colonne de l'adresse e-mail (« email » ou « adresse »).",
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Lire le fichier" }),
        ),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Il manque la colonne",
    );
  });
});
