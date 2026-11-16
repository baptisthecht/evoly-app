import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  BlockBuyerDialog,
  BlockedBuyersTable,
  type BlockedBuyerItem,
} from "@/app/o/[orgSlug]/orders/BlockedBuyers";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  blockBuyerAction: vi.fn(),
  unblockBuyerAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/orders/actions", () => actions);
const a = fr.ordersAdmin as Record<string, string>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const fill = (msg: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    msg,
  );
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: { cards: 0 } });
  }
});
afterEach(() => vi.restoreAllMocks());
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);

const rows: BlockedBuyerItem[] = [
  {
    id: "b1",
    name: "Marc Noir",
    email: "marc@exemple.be",
    hasCard: true,
    reason: "Revente sauvage",
    addedBy: "Camille",
    date: "16 novembre 2026",
    dateAt: 2,
  },
  {
    id: "b2",
    name: null,
    email: "anonyme@exemple.be",
    hasCard: false,
    reason: null,
    addedBy: null,
    date: "2 novembre 2026",
    dateAt: 1,
  },
];

describe("Commandes, onglet « Personnes bloquées »", () => {
  it("tableau : personne, adresse, carte enregistrée, motif, auteur, date ; valeurs absentes signalées", () => {
    wrap(<BlockedBuyersTable rows={rows} orgSlug="club" canManage />);
    for (const text of [
      "Marc Noir",
      "marc@exemple.be",
      "Revente sauvage",
      "Camille",
      "16 novembre 2026",
      a.blockedCardYes!,
      a.blockedCardNo!,
    ])
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    expect(screen.getAllByText(a.blockedMissing!).length).toBe(3); // nom, motif, auteur de la seconde ligne
    expect(screen.getAllByRole("button", { name: a.unblock })).toHaveLength(2);
  });

  it("sans droit de gestion : pas de « Débloquer » ; liste vide : l'état vide et son bouton", () => {
    const { unmount } = wrap(
      <BlockedBuyersTable rows={rows} orgSlug="club" canManage={false} />,
    );
    expect(screen.queryByRole("button", { name: a.unblock })).toBeNull();
    unmount();
    wrap(<BlockedBuyersTable rows={[]} orgSlug="club" canManage />);
    expect(screen.getByText(a.blockedEmptyTitle!)).toBeTruthy();
    expect(screen.getByRole("button", { name: a.blockPerson })).toBeTruthy();
  });

  it("« Débloquer » : jamais sans confirmation", async () => {
    wrap(<BlockedBuyersTable rows={rows} orgSlug="club" canManage />);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const button = screen.getAllByRole("button", { name: a.unblock })[0]!;
    await act(async () => void fireEvent.submit(button.closest("form")!));
    expect(confirm).toHaveBeenCalledWith(
      fill(a.unblockConfirm!, { name: "Marc Noir" }),
    );
    expect(actions.unblockBuyerAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => void fireEvent.submit(button.closest("form")!));
    await waitFor(() =>
      expect(actions.unblockBuyerAction.mock.calls[0]!.slice(0, 2)).toEqual([
        "club",
        "b1",
      ]),
    );
  });
});

describe("« Bloquer une personne » et « Bloquer cet acheteur »", () => {
  it("fenêtre vide : adresse, prénom, nom, motif envoyés ; fermée une fois la personne bloquée", async () => {
    wrap(<BlockBuyerDialog orgSlug="club" />);
    fireEvent.click(screen.getByRole("button", { name: a.blockPerson }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(a.blockedEmail!), {
      target: { value: "nuisible@exemple.be" },
    });
    fireEvent.change(screen.getByLabelText(a.firstName!), {
      target: { value: "Jean" },
    });
    fireEvent.change(screen.getByLabelText(a.lastName!), {
      target: { value: "Dupont" },
    });
    fireEvent.change(screen.getByLabelText(a.blockedReason!), {
      target: { value: "Insultes au bar" },
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: a.blockSubmit }),
        ),
    );
    await waitFor(() => expect(actions.blockBuyerAction).toHaveBeenCalled());
    const call = actions.blockBuyerAction.mock.calls[0]!;
    expect(call.slice(0, 2)).toEqual(["club", null]);
    const form = call.at(-1) as FormData;
    expect(Object.fromEntries(form.entries())).toEqual({
      email: "nuisible@exemple.be",
      firstName: "Jean",
      lastName: "Dupont",
      reason: "Insultes au bar",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("depuis une commande : champs préremplis, cartes de ses commandes annoncées", () => {
    wrap(
      <BlockBuyerDialog
        orgSlug="club"
        orderId="o1"
        prefill={{
          email: "marc@exemple.be",
          firstName: "Marc",
          lastName: "Noir",
        }}
        cards={2}
        trigger={a.blockThisBuyer}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: a.blockThisBuyer }));
    expect(
      (screen.getByLabelText(a.blockedEmail!) as HTMLInputElement).value,
    ).toBe("marc@exemple.be");
    expect(
      (screen.getByLabelText(a.firstName!) as HTMLInputElement).value,
    ).toBe("Marc");
    expect(
      screen.getByText(
        (c) =>
          norm(c) ===
          norm(
            "Les 2 cartes utilisées dans ses commandes seront aussi bloquées.",
          ),
      ),
    ).toBeTruthy();
  });

  it("erreur du serveur : affichée, la fenêtre reste ouverte", async () => {
    actions.blockBuyerAction.mockResolvedValue({
      ok: false,
      error: "BLOCK_NEEDS_EMAIL_OR_NAME",
    });
    wrap(<BlockBuyerDialog orgSlug="club" />);
    fireEvent.click(screen.getByRole("button", { name: a.blockPerson }));
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: a.blockSubmit }),
        ),
    );
    await waitFor(() =>
      expect(
        screen.getByText(fr.formErrors.BLOCK_NEEDS_EMAIL_OR_NAME),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
