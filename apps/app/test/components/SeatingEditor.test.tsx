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
const seat = (n: number, status = "FREE") => ({
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

describe("éditeur de plan de salle (section 9.9)", () => {
  it("plan vide : un modèle de salle est proposé d'abord", () => {
    draw(state({ blocks: [], seats: [], rows: [] }));
    expect(screen.getByText(t.chooseTemplate!)).toBeTruthy();
    expect(screen.getAllByText((c) => c === t.tpl_theatre).length).toBeGreaterThan(0);
  });

  it("places vendues : plus de changement de modèle, le motif est expliqué", () => {
    draw(state({ hasSales: true, seats: [seat(1, "SOLD"), seat(2), seat(3), seat(4)] }));
    const change = screen.getByRole("button", { name: t.changeTemplate }) as HTMLButtonElement;
    expect([change.disabled, change.title]).toEqual([true, t.templateLocked]); // un nouveau modèle remplacerait les places vendues
    fireEvent.click(change);
    expect(screen.queryByText(t.chooseTemplate!)).toBeNull();
  });

  it("ajout d'un bloc : le bon type de bloc est envoyé, placé sur le plan", async () => {
    draw();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.add_rows })));
    await waitFor(() => expect(actions.seatingBlockAction).toHaveBeenCalled());
    const [org, ev, input] = actions.seatingBlockAction.mock.calls[0] as unknown as [string, string, { id: null; kind: string; x: number; y: number }];
    expect([org, ev, input.id, input.kind, Number.isFinite(input.x), Number.isFinite(input.y)]).toEqual(["club", "e1", null, "ROWS", true, true]);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("refus du serveur : expliqué, la page n'est pas rafraîchie", async () => {
    actions.seatingBlockAction.mockResolvedValueOnce({ ok: false, error: "SEATING_BLOCK_HAS_SALES" } as never);
    draw();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.add_stage })));
    expect(await screen.findByText((c) => norm(c) === norm(t.error_SEATING_BLOCK_HAS_SALES!))).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("simple consultation : rien de modifiable", () => {
    draw(state(), true);
    expect(screen.getByText(t.hintReadOnly!)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.add_rows })).toBeNull();
    expect(screen.queryByRole("button", { name: t.undo })).toBeNull();
  });
});
