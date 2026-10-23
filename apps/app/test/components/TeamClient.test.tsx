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
  InvitationActions,
  InviteForm,
  LeaveOrganization,
  MemberRole,
  RemoveMember,
  TransferOwnership,
} from "@/app/o/[orgSlug]/members/TeamClient";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  deleteRoleAction: vi.fn(),
  invitationCommandAction: vi.fn(),
  inviteAction: vi.fn(),
  leaveAction: vi.fn(),
  memberRoleAction: vi.fn(),
  removeMemberAction: vi.fn(),
  saveRoleAction: vi.fn(),
  transferAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/members/actions", () => actions);
const all = fr as unknown as Record<string, Record<string, string>>;
const t =
  all[
    Object.keys(all).find(
      (k) => all[k]?.confirmRemove && all[k]?.transferNobody,
    )!
  ]!;
// espaces insécables de la ponctuation française : comparés après la même normalisation des deux côtés
const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const text = (wanted: string) => (c: string) => norm(c) === norm(wanted);
const fill = (msg: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), msg);
const roles = [
  { id: "r-admin", name: "Administrateur" },
  { id: "r-scan", name: "Contrôle des entrées" },
] as never;
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.restoreAllMocks());
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);
const submit = async (button: HTMLElement) =>
  act(async () => void fireEvent.submit(button.closest("form")!));

describe("équipe : actions irréversibles toujours confirmées", () => {
  it("retrait d'un membre : confirmation annulée, rien n'est retiré ; acceptée, le retrait part", async () => {
    wrap(<RemoveMember orgSlug="club" memberId="m1" name="Tom Dubois" />);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await submit(screen.getByRole("button", { name: t.remove }));
    expect(confirm).toHaveBeenCalledWith(
      fill(t.confirmRemove!, { name: "Tom Dubois" }),
    );
    expect(actions.removeMemberAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await submit(screen.getByRole("button", { name: t.remove }));
    await waitFor(() =>
      expect(actions.removeMemberAction.mock.calls[0]!.slice(0, 2)).toEqual([
        "club",
        "m1",
      ]),
    );
  });

  it("quitter l'organisation : confirmation annulée, rien ne se passe ; acceptée, le départ part", async () => {
    wrap(<LeaveOrganization orgSlug="club" />);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await submit(screen.getByRole("button", { name: t.leave }));
    expect(actions.leaveAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await submit(screen.getByRole("button", { name: t.leave }));
    await waitFor(() => expect(actions.leaveAction).toHaveBeenCalled());
  });

  it("transfert de propriété : confirmation annulée, rien n'est transféré ; sans autre membre, impossible", async () => {
    const a = wrap(
      <TransferOwnership
        orgSlug="club"
        members={[{ id: "m2", label: "Léa Martin" }]}
      />,
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await submit(screen.getByRole("button", { name: t.transfer }));
    expect(actions.transferAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await submit(screen.getByRole("button", { name: t.transfer }));
    await waitFor(() => expect(actions.transferAction).toHaveBeenCalled());
    a.unmount();
    wrap(<TransferOwnership orgSlug="club" members={[]} />);
    expect(screen.getByText(text(t.transferNobody!))).toBeTruthy();
  });
});

describe("équipe : invitations et rôles", () => {
  it("invitation : adresse et rôle envoyés, puis confirmée", async () => {
    wrap(<InviteForm orgSlug="club" roles={roles} />);
    fireEvent.change(screen.getByLabelText(new RegExp(t.inviteEmail!)), {
      target: { value: "zoe@exemple.be" },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(`^${t.role}`)), {
      target: { value: "r-scan" },
    });
    await submit(screen.getByRole("button", { name: t.invite }));
    await waitFor(() => expect(actions.inviteAction).toHaveBeenCalled());
    const data = actions.inviteAction.mock.calls[0]!.at(-1) as FormData;
    expect([data.get("email"), [...data.values()].includes("r-scan")]).toEqual([
      "zoe@exemple.be",
      true,
    ]);
    expect(await screen.findByText(text(t.invited!))).toBeTruthy();
  });

  it("changement de rôle : envoyé dès qu'on le choisit", async () => {
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(function (this: HTMLFormElement) {
        this.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
    wrap(
      <MemberRole
        orgSlug="club"
        memberId="m1"
        roleId="r-admin"
        roles={roles}
      />,
    );
    await act(
      async () =>
        void fireEvent.change(screen.getByRole("combobox", { name: t.role }), {
          target: { value: "r-scan" },
        }),
    );
    expect(requestSubmit).toHaveBeenCalled();
    await waitFor(() =>
      expect(actions.memberRoleAction.mock.calls[0]!.slice(0, 2)).toEqual([
        "club",
        "m1",
      ]),
    );
  });

  it("invitation en attente : renvoyée (puis « renvoyée ») ou révoquée", async () => {
    wrap(<InvitationActions orgSlug="club" invitationId="i1" />);
    await submit(screen.getByRole("button", { name: t.resend }));
    await waitFor(() =>
      expect(
        actions.invitationCommandAction.mock.calls[0]!.slice(0, 3),
      ).toEqual(["club", "i1", "resend"]),
    );
    expect(await screen.findByRole("button", { name: t.resent })).toBeTruthy();
    await submit(screen.getByRole("button", { name: t.revoke }));
    await waitFor(() =>
      expect(
        actions.invitationCommandAction.mock.calls.at(-1)!.slice(0, 3),
      ).toEqual(["club", "i1", "revoke"]),
    );
  });
});
