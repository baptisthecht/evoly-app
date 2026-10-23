import { PERMISSION_GROUPS, type Permission } from "@evoly/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { RoleEditor } from "@/app/o/[orgSlug]/members/TeamClient";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  saveRoleAction: vi.fn(),
  deleteRoleAction: vi.fn(),
  invitationCommandAction: vi.fn(),
  inviteAction: vi.fn(),
  leaveAction: vi.fn(),
  memberRoleAction: vi.fn(),
  removeMemberAction: vi.fn(),
  transferAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/members/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).team!;
const tp = (fr as unknown as Record<string, Record<string, string>>)
  .permissions!;
const all = PERMISSION_GROUPS.flatMap((g) => g.permissions) as Permission[];
const [granted, other, forbidden] = [all[0]!, all[1]!, all[2]!];
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.restoreAllMocks());
const draw = () =>
  render(
    <Fr>
      <RoleEditor
        orgSlug="club"
        role={{
          id: "r1",
          name: "Cible",
          description: "",
          permissions: [granted, forbidden],
        }}
        allowed={[granted, other]}
      />
    </Fr>,
  );
const box = (p: Permission) =>
  screen.getByRole("checkbox", { name: tp[p] }) as HTMLInputElement;

describe("éditeur des rôles", () => {
  it("permission non accordable : cochée si le rôle l'a, mais désactivée, et jamais envoyée par le formulaire", async () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: t.editRole }));
    expect([box(granted).checked, box(granted).disabled]).toEqual([
      true,
      false,
    ]);
    expect([box(forbidden).checked, box(forbidden).disabled]).toEqual([
      true,
      true,
    ]);
    fireEvent.click(box(other));
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: t.saveRole }).closest("form")!,
        ),
    );
    await waitFor(() => expect(actions.saveRoleAction).toHaveBeenCalled());
    // c'est pourquoi le serveur conserve lui-même les permissions que l'auteur ne peut pas accorder
    expect(
      (actions.saveRoleAction.mock.calls[0]!.at(-1) as FormData)
        .getAll("permissions")
        .sort(),
    ).toEqual([granted, other].sort());
  });

  it("suppression d'un rôle : confirmation annulée, rien n'est supprimé", async () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: t.editRole }));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: t.deleteRole }).closest("form")!,
        ),
    );
    expect(actions.deleteRoleAction).not.toHaveBeenCalled();
  });

  it("nouveau rôle : bouton de création, et « annuler » referme", () => {
    render(
      <Fr>
        <RoleEditor orgSlug="club" role={null} allowed={[granted]} />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: `+ ${t.newRole}` }));
    expect(screen.queryByRole("button", { name: t.deleteRole })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(screen.getByRole("button", { name: `+ ${t.newRole}` })).toBeTruthy();
  });
});
