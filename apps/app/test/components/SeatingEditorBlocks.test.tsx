import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SeatingEditor } from "@/app/o/[orgSlug]/events/[eventId]/seating/SeatingEditor";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  seatingBlockAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingBlockDeleteAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingCategoryAddAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingCategoryUpdateAction: vi.fn(
    async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown },
  ),
  seatingCommandAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutApplyAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutDeleteAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutSaveAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutSearchAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingMoveAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingPhotoAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingPhotoApplyAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingSeatAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingTemplateAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingViewAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "b-nouveau" } }) as { ok: boolean; error?: string; data?: unknown }),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const t = (fr as unknown as Record<string, Record<string, string>>).seatingEditor!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const seat = (n: number, status = "AVAILABLE") => ({
  id: `s${n}`,
  blockId: "b1",
  rowId: "r1",
  label: String(n),
  x: n * 30,
  y: 0,
  categoryId: "c1",
  accessible: false,
  status,
  holder: status === "SOLD" ? "Léa Martin" : null,
  ticketId: null,
});
const state = (over: Record<string, unknown> = {}) =>
  ({
    mode: "ASSIGNED",
    allowChoice: true,
    template: "theatre",
    focus: { x: 75, y: -200 },
    categories: [{ id: "c1", name: "Parterre", color: "#FFB8E8", ticketTypeIds: ["t1"] }],
    ticketTypes: [{ id: "t1", name: "Fosse", categoryId: "c1" }],
    blocks: [{ id: "b1", kind: "rows", name: "Parterre", x: 0, y: 0, rotation: 0, params: { rows: 1, seats: 4 } }],
    rows: [{ id: "r1", name: "A", blockId: "b1", categoryId: "c1" }],
    seats: [1, 2, 3, 4].map((n) => seat(n)),
    hasSales: false,
    ...over,
  }) as never;
beforeEach(() => router.refresh.mockReset());
const draw = (s = state(), readOnly = false) =>
  render(
    <Fr>
      <SeatingEditor orgSlug="club" eventId="e1" state={s} layouts={[]} heat={null} photoEnabled={false} readOnly={readOnly} />
    </Fr>,
  );

describe("éditeur de plan de salle : blocs", () => {
  const openBlock = () => {
    const button = screen.getAllByRole("button", { name: /Parterre/ }).find((b) => b.hasAttribute("aria-pressed"))!;
    fireEvent.click(button);
  };
  beforeEach(() => {
    vi.stubGlobal("confirm", () => true);
  });

  it("choisir un bloc dans la liste ouvre son panneau", () => {
    draw(state());
    openBlock();
    expect((document.getElementById("blk-name") as HTMLInputElement).value).toBe("Parterre");
  });

  it("renommer un bloc : le nouveau nom est envoyé", async () => {
    draw(state());
    openBlock();
    fireEvent.change(document.getElementById("blk-name")!, { target: { value: "Balcon" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.saveBlock })));
    await waitFor(() => expect(actions.seatingBlockAction).toHaveBeenCalled());
    expect(actions.seatingBlockAction.mock.calls.at(-1)![2]).toEqual(expect.objectContaining({ id: "b1", name: "Balcon" }));
  });

  it("supprimer un bloc : la demande part pour ce bloc", async () => {
    draw(state());
    openBlock();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.deleteBlock })));
    await waitFor(() => expect(actions.seatingBlockDeleteAction).toHaveBeenCalled());
    expect(actions.seatingBlockDeleteAction.mock.calls.at(-1)![2]).toBe("b1");
  });

  it("vue depuis le bloc : photo envoyée ; « retirer » envoie le retrait", async () => {
    draw(
      state({
        blocks: [{ id: "b1", kind: "rows", name: "Parterre", x: 0, y: 0, rotation: 0, params: { rows: 1, seats: 4, viewUrl: "https://cdn.evoly.me/vue.jpg" } }],
      }),
    );
    openBlock();
    const input = document.getElementById("blk-view") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "vue.jpg", { type: "image/jpeg" })] } });
    await act(async () => void fireEvent.submit(input.closest("form")!));
    await waitFor(() => expect(actions.seatingViewAction).toHaveBeenCalled());
    // le navigateur simulé ne recopie pas le fichier dans le formulaire : le bloc et l'envoi du formulaire suffisent
    const [, , block, form] = actions.seatingViewAction.mock.calls.at(-1)! as [string, string, string, FormData];
    expect(block).toBe("b1");
    expect(form).toBeInstanceOf(FormData);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.viewRemove })));
    await waitFor(() => expect(actions.seatingViewAction.mock.calls.at(-1)![3]).toBeNull());
  });
});
