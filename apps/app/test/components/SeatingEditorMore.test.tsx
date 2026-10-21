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

describe("éditeur de plan de salle : modèle, catégorie, zoom", () => {
  it("enregistrer le plan comme modèle : nom et ville nettoyés, partage désactivé par défaut", async () => {
    draw(state());
    fireEvent.change(document.getElementById("lay-name")!, { target: { value: "  Salle des fêtes de Mouscron  " } });
    fireEvent.change(document.getElementById("lay-city")!, { target: { value: " Mouscron " } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.saveLayoutDo })));
    await waitFor(() => expect(actions.seatingLayoutSaveAction).toHaveBeenCalled());
    expect(actions.seatingLayoutSaveAction.mock.calls.at(-1)!.slice(2)).toEqual([{ name: "Salle des fêtes de Mouscron", city: "Mouscron", shared: false }]);
  });

  it("catégorie : nouveau nom, nouvelle couleur et tarif délié envoyés", async () => {
    draw(state());
    fireEvent.change(document.getElementById("cat-c1")!, { target: { value: " Balcon " } });
    fireEvent.change(screen.getByLabelText(t.colorOf!.replace("{name}", "Parterre")), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Fosse" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.saveCategory })));
    await waitFor(() => expect(actions.seatingCategoryUpdateAction).toHaveBeenCalled());
    expect(actions.seatingCategoryUpdateAction.mock.calls.at(-1)!.slice(2)).toEqual(["c1", { name: "Balcon", color: "#123456", ticketTypeIds: [] }]);
  });

  it("zoom : « + » resserre le cadrage du plan, « − » le rélargit", () => {
    const { container } = render(<></>);
    void container;
    draw(state());
    const svg = () => [...document.querySelectorAll("svg[viewBox]")].sort((a, b) => b.getAttribute("viewBox")!.length - a.getAttribute("viewBox")!.length)[0]!;
    const width = () => Number(svg().getAttribute("viewBox")!.split(/\s+/)[2]);
    const start = width();
    fireEvent.click(screen.getByRole("button", { name: t.zoomIn }));
    expect(width()).toBeLessThan(start);
    fireEvent.click(screen.getByRole("button", { name: t.zoomOut }));
    expect(width()).toBeCloseTo(start, 5);
  });
});
