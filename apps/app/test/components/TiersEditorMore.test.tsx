import { EUR_TERMS } from "@evoly/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  TiersEditor,
  type TierRow,
} from "@/app/o/[orgSlug]/events/[eventId]/tickets/TiersEditor";
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
const draw = (
  over: { initial?: TierRow[]; enabled?: boolean; locked?: boolean } = {},
) =>
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
const button = (name: string) =>
  screen.queryByRole("button", { name }) as HTMLButtonElement | null;

describe("paliers de prix : cas restants", () => {
  const saveButton = () => screen.getByRole("button", { name: t.save });

  it("offre gratuite sans palier : invitation au Pro, aucun bouton d'ajout", () => {
    draw({ enabled: false, initial: [] });
    expect(norm(document.body.textContent!)).toContain(norm(t.proPitch!));
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.add })).toBeNull();
  });

  it("enregistré avec un trou entre deux paliers : avertissement à la place de la confirmation", async () => {
    actions.saveTiersAction.mockResolvedValue({
      ok: true,
      data: {
        issues: [
          {
            kind: "GAP",
            from: "2027-03-01T10:00:00.000Z",
            to: "2027-03-05T10:00:00.000Z",
          },
        ],
      },
    });
    draw({ initial: [tier()] });
    await act(async () => void fireEvent.click(saveButton()));
    await waitFor(() => expect(actions.saveTiersAction).toHaveBeenCalled());
    const page = norm(document.body.textContent!);
    expect(page).toContain(norm(t.gap!.split("{")[0]!));
    expect(page).not.toContain(norm(t.saved!));
  });

  it("enregistrement refusé : message d'erreur (connu ou générique)", async () => {
    actions.saveTiersAction.mockResolvedValue({
      ok: false,
      error: "CODE_INCONNU_DU_SERVEUR",
    });
    draw({ initial: [tier()] });
    await act(async () => void fireEvent.click(saveButton()));
    await waitFor(() =>
      expect(norm(document.body.textContent!)).toContain(
        norm(all.formErrors!.generic!),
      ),
    );
  });

  it("dix paliers : plus d'ajout possible", () => {
    draw({
      initial: Array.from({ length: 10 }, (_, i) =>
        tier({ id: `p${i}`, name: `Palier ${i}` }),
      ),
    });
    expect(
      (screen.getByRole("button", { name: t.add }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
