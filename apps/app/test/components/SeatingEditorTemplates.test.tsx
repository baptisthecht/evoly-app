import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SeatingEditor } from "@/app/o/[orgSlug]/events/[eventId]/seating/SeatingEditor";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  seatingBlockAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingBlockDeleteAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingCategoryAddAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingCategoryUpdateAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingCommandAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutApplyAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutDeleteAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutSaveAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutSearchAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingMoveAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingPhotoAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingPhotoApplyAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingSeatAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingTemplateAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingViewAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "b-nouveau" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const t = (fr as unknown as Record<string, Record<string, string>>)
  .seatingEditor!;
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
    categories: [
      { id: "c1", name: "Parterre", color: "#FFB8E8", ticketTypeIds: ["t1"] },
    ],
    ticketTypes: [{ id: "t1", name: "Fosse", categoryId: "c1" }],
    blocks: [
      {
        id: "b1",
        kind: "rows",
        name: "Parterre",
        x: 0,
        y: 0,
        rotation: 0,
        params: { rows: 1, seats: 4 },
      },
    ],
    rows: [{ id: "r1", name: "A", blockId: "b1", categoryId: "c1" }],
    seats: [1, 2, 3, 4].map((n) => seat(n)),
    hasSales: false,
    ...over,
  }) as never;
beforeEach(() => router.refresh.mockReset());
const draw = (s = state(), readOnly = false) =>
  render(
    <Fr>
      <SeatingEditor
        orgSlug="club"
        eventId="e1"
        state={s}
        layouts={[]}
        heat={null}
        photoEnabled={false}
        readOnly={readOnly}
      />
    </Fr>,
  );

describe("éditeur de plan de salle : modèles de salle", () => {
  const empty = () => state({ blocks: [], seats: [], rows: [] });
  const withLayouts = (layouts: unknown[]) =>
    render(
      <Fr>
        <SeatingEditor
          orgSlug="club"
          eventId="e1"
          state={empty()}
          layouts={layouts as never}
          heat={null}
          photoEnabled={false}
          readOnly={false}
        />
      </Fr>,
    );
  beforeEach(() => {
    vi.stubGlobal("confirm", () => true);
  });

  it("plan vide : modèle « Gala » (tables rondes) choisi, « générer » envoie ce modèle et ses dimensions", async () => {
    draw(empty());
    fireEvent.click(screen.getAllByText((c) => c === t.tpl_gala)[0]!);
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: t.generate })),
    );
    await waitFor(() =>
      expect(actions.seatingTemplateAction).toHaveBeenCalled(),
    );
    expect(actions.seatingTemplateAction.mock.calls.at(-1)![2]).toEqual({
      template: "gala",
      options: expect.objectContaining({ tables: expect.any(Number) }),
    });
  });

  it("modèles enregistrés : la recherche affiche un modèle partagé ; « utiliser » applique ce modèle", async () => {
    actions.seatingLayoutSearchAction.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: "l1",
          name: "Salle Ernest Solvay",
          city: "Mouscron",
          seatCount: 120,
          mine: false,
          shared: true,
        },
      ],
    });
    draw(empty());
    fireEvent.change(document.getElementById("lay-q")!, {
      target: { value: "salle" },
    });
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: t.find })),
    );
    const item = (await screen.findByText("Salle Ernest Solvay")).closest(
      "li",
    )!;
    expect(norm(item.textContent!)).toContain("Mouscron");
    await act(
      async () =>
        void fireEvent.click(
          within(item).getByRole("button", { name: t.layoutUse }),
        ),
    );
    await waitFor(() =>
      expect(actions.seatingLayoutApplyAction).toHaveBeenCalled(),
    );
    expect(actions.seatingLayoutApplyAction.mock.calls.at(-1)![2]).toBe("l1");
  });

  it("modèle à moi : supprimé, il disparaît de la liste", async () => {
    actions.seatingLayoutDeleteAction.mockResolvedValueOnce({ ok: true });
    withLayouts([
      {
        id: "l2",
        name: "Mon gala",
        city: null,
        seatCount: 80,
        mine: true,
        shared: false,
      },
    ]);
    const item = screen.getByText("Mon gala").closest("li")!;
    const remove = within(item)
      .getAllByRole("button")
      .find((b) => b.textContent !== t.layoutUse)!;
    await act(async () => void fireEvent.click(remove));
    await waitFor(() =>
      expect(actions.seatingLayoutDeleteAction).toHaveBeenCalled(),
    );
    expect(actions.seatingLayoutDeleteAction.mock.calls.at(-1)![1]).toBe("l2");
    await waitFor(() => expect(screen.queryByText("Mon gala")).toBeNull());
  });
});
