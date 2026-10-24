import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ImportHistory } from "@/app/o/[orgSlug]/events/[eventId]/distribution/ImportHistory";
import { Fr } from "./intl";

// historique des imports : chaque vague se supprime, billets déjà entrés gardés
const actions = vi.hoisted(() => ({ deleteImportBatchAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>)
  .distribution!;
const row = (o: Record<string, unknown> = {}) => ({
  id: "b1",
  distributor: "Fnac (France Billet)",
  fileName: "fnac-lundi.csv",
  createdAt: "2026-10-24T09:30:00.000Z",
  createdBy: "Camille Dupont",
  status: "IMPORTED" as const,
  created: 120,
  deletedAt: null,
  deletedCount: null,
  keptEntered: null,
  ...o,
});
beforeEach(() => actions.deleteImportBatchAction.mockReset());

describe("historique des imports", () => {
  it("suppression : annulée à la confirmation, rien ne part ; acceptée, bilan affiché", async () => {
    actions.deleteImportBatchAction.mockResolvedValue({
      ok: true,
      data: { deleted: 118, keptEntered: 2 },
    });
    render(
      <Fr>
        <ImportHistory orgSlug="club" eventId="e1" batches={[row()]} />
      </Fr>,
    );
    expect(
      screen.getByText("fnac-lundi.csv · Fnac (France Billet)"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        (c) =>
          c.includes("par Camille Dupont") && c.includes("120 billets ajoutés"),
      ),
    ).toBeTruthy();
    const button = screen.getByRole("button", { name: t.historyDelete });
    vi.stubGlobal("confirm", () => false);
    fireEvent.submit(button.closest("form")!);
    expect(actions.deleteImportBatchAction).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", () => true);
    await act(async () => void fireEvent.submit(button.closest("form")!));
    await waitFor(() =>
      expect(actions.deleteImportBatchAction).toHaveBeenCalled(),
    );
    expect(
      await screen.findByText(
        "118 billets retirés ; 2 billets déjà entrés gardés.",
      ),
    ).toBeTruthy();
  });

  it("import supprimé : date et bilan de la suppression, plus de bouton", () => {
    render(
      <Fr>
        <ImportHistory
          orgSlug="club"
          eventId="e1"
          batches={[
            row({
              status: "DELETED",
              deletedAt: "2026-10-24T10:00:00.000Z",
              deletedCount: 118,
              keptEntered: 2,
            }),
          ]}
        />
      </Fr>,
    );
    expect(
      screen.getByText(
        (c) =>
          c.startsWith("Supprimé le") &&
          c.includes("118 billets retirés, 2 gardés."),
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.historyDelete })).toBeNull();
  });
});
