import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SeatingEditor } from "@/app/o/[orgSlug]/events/[eventId]/seating/SeatingEditor";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  seatingBlockAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingBlockDeleteAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingCategoryAddAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingCategoryUpdateAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingCommandAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutApplyAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutDeleteAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutSaveAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingLayoutSearchAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingMoveAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingPhotoAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingPhotoApplyAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingSeatAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingTemplateAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
  seatingViewAction: vi.fn(async (..._args: unknown[]) => ({ ok: true, data: { id: "x" } }) as { ok: boolean; error?: string; data?: unknown }),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const t = (fr as unknown as Record<string, Record<string, string>>).seatingEditor!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
beforeAll(() => {
  // le navigateur simulé ne connaît pas les événements de pointeur : sans eux, les coordonnées du glissé sont ignorées
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventLike extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    window.PointerEvent = PointerEventLike as unknown as typeof PointerEvent;
  }
  // ni la capture du pointeur
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  // ni de taille d'affichage : un vrai plan mesure toujours quelques centaines de pixels
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(Element.prototype, "clientHeight", { configurable: true, get: () => 500 });
});
const seat = (n: number, status = "AVAILABLE", categoryId = "c1") => ({
  id: `s${n}`,
  blockId: "b1",
  rowId: "r1",
  row: "A",
  label: String(n),
  x: n * 30,
  y: 0,
  angle: 0,
  categoryId,
  accessible: false,
  note: null,
  status,
  holder: status === "SOLD" ? { name: "Léa Martin", entered: false } : null,
  ticketId: null,
});
const state = () =>
  ({
    mode: "ASSIGNED",
    allowChoice: true,
    template: "theatre",
    focus: { x: 75, y: -200 },
    categories: [
      { id: "c1", name: "Parterre", color: "#FFB8E8", ticketTypeIds: ["t1"] },
      { id: "c2", name: "Balcon", color: "#C9B8FF", ticketTypeIds: [] },
    ],
    ticketTypes: [{ id: "t1", name: "Fosse", categoryId: "c1" }],
    blocks: [{ id: "b1", kind: "ROWS", name: "Parterre", x: 0, y: 0, rotation: 0, params: { rows: 1, seats: 5 } }],
    rows: [{ id: "r1", name: "A", blockId: "b1", categoryId: "c1" }],
    seats: [seat(1, "SOLD"), seat(2, "SOLD"), seat(3), seat(4, "AVAILABLE", "c2")],
    hasSales: true,
  }) as never;
beforeEach(() => {
  router.refresh.mockReset();
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: { id: "x" } });
  }
});
const draw = () =>
  render(
    <Fr>
      <SeatingEditor orgSlug="club" eventId="e1" state={state()} layouts={[]} heat={null} photoEnabled={false} readOnly={false} />
    </Fr>,
  );
const tap = (id: string) => {
  const el = document.querySelector(`[data-seat="${id}"]`)!.firstElementChild ?? document.querySelector(`[data-seat="${id}"]`)!;
  fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: 10, clientY: 10, pointerId: 1 });
};
const find = (row: string, label: string) => {
  fireEvent.change(document.getElementById("find-row")!, { target: { value: row } });
  fireEvent.change(document.getElementById("find-seat")!, { target: { value: label } });
  fireEvent.submit(document.getElementById("find-seat")!.closest("form")!);
};

describe("éditeur de plan de salle : déplacements et catégories", () => {
  it("déplacement d'un acheteur : vers une place libre de la même catégorie seulement, confirmé puis envoyé", async () => {
    draw();
    find("A", "2");
    fireEvent.click(screen.getByRole("button", { name: t.moveStart }));
    const banner = () =>
      norm(
        screen
          .getAllByRole("status")
          .map((x) => x.textContent ?? "")
          .join(" "),
      );
    tap("s1"); // place vendue : ignorée
    tap("s4"); // autre catégorie : ignorée (le prix changerait)
    expect(banner()).toContain(norm(t.moveChoose!.replace("{name}", "Léa Martin")));
    tap("s3");
    expect(banner()).toContain("Léa Martin");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.moveDo })));
    await waitFor(() => expect(actions.seatingMoveAction).toHaveBeenCalledWith("club", "e1", "s2", "s3"));
  });

  it("bloc glissé sur le plan : nouvelle position envoyée, calée sur la grille de 5", async () => {
    draw();
    const block = document.querySelector('[data-block="b1"]')!;
    fireEvent.pointerDown(block, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(block, { clientX: 113, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(block, { clientX: 113, clientY: 100, pointerId: 1 });
    await waitFor(() => expect(actions.seatingBlockAction).toHaveBeenCalled());
    const input = actions.seatingBlockAction.mock.calls.at(-1)![2] as { id: string; x: number; y: number };
    expect([input.id, input.x % 5, input.y % 5, input.x > 0]).toEqual(["b1", 0, 0, true]);
  });

  it("nouvelle catégorie : nom et couleur envoyés", async () => {
    draw();
    fireEvent.change(document.getElementById("cat-new")!, { target: { value: "  Loges  " } });
    await act(async () => void fireEvent.submit(document.getElementById("cat-new")!.closest("form")!));
    await waitFor(() => expect(actions.seatingCategoryAddAction).toHaveBeenCalled());
    expect(actions.seatingCategoryAddAction.mock.calls[0]!.at(-1)).toMatchObject({ name: "Loges" });
  });

  it("catégorie rattachée à ses tarifs : modification envoyée", async () => {
    draw();
    const boxes = screen.getAllByRole("checkbox", { name: "Fosse" }) as HTMLInputElement[];
    expect(boxes[0]!.checked).toBe(true); // Parterre est vendue au tarif Fosse
    fireEvent.click(boxes[1]!); // Balcon aussi
    fireEvent.change(document.getElementById("cat-c2")!, { target: { value: "Balcon haut" } });
    const save = screen.getAllByRole("button", { name: t.saveCategory })[1]!;
    await act(async () => void fireEvent.click(save));
    await waitFor(() => expect(actions.seatingCategoryUpdateAction).toHaveBeenCalled());
    expect(JSON.stringify(actions.seatingCategoryUpdateAction.mock.calls.at(-1))).toContain('"ticketTypeIds":["t1"]');
    expect(JSON.stringify(actions.seatingCategoryUpdateAction.mock.calls.at(-1))).toContain("Balcon haut");
  });
});
