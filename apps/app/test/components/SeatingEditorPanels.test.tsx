import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SeatingEditor } from "@/app/o/[orgSlug]/events/[eventId]/seating/SeatingEditor";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  seatingBlockAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingBlockDeleteAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingCategoryAddAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingCategoryUpdateAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingCommandAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutApplyAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutDeleteAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutSaveAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingLayoutSearchAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingMoveAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingPhotoAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingPhotoApplyAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingSeatAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingTemplateAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
        ok: boolean;
        error?: string;
        data?: unknown;
      },
  ),
  seatingViewAction: vi.fn(
    async (..._args: unknown[]) =>
      ({ ok: true, data: { id: "x" } }) as {
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
  row: "A",
  label: String(n),
  x: n * 30,
  y: 0,
  categoryId: "c1",
  accessible: false,
  note: null,
  status,
  holder: status === "SOLD" ? { name: "Léa Martin", entered: false } : null,
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
        kind: "ROWS",
        name: "Parterre",
        x: 0,
        y: 0,
        rotation: 0,
        params: { rows: 1, seats: 4 },
      },
    ],
    rows: [{ id: "r1", name: "A", blockId: "b1", categoryId: "c1" }],
    seats: [seat(1), seat(2, "SOLD"), seat(3), seat(4)],
    hasSales: true,
    ...over,
  }) as never;
beforeEach(() => {
  router.refresh.mockReset();
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: { id: "x" } });
  }
});
const draw = (s = state()) =>
  render(
    <Fr>
      <SeatingEditor
        orgSlug="club"
        eventId="e1"
        state={s}
        layouts={[]}
        heat={null}
        photoEnabled={false}
        readOnly={false}
      />
    </Fr>,
  );
const find = (row: string, label: string) => {
  fireEvent.change(document.getElementById("find-row")!, {
    target: { value: row },
  });
  fireEvent.change(document.getElementById("find-seat")!, {
    target: { value: label },
  });
  fireEvent.submit(document.getElementById("find-seat")!.closest("form")!);
};
const seatTitle = (row: string, label: string) =>
  norm(t.seatTitle!.replace("{row}", row).replace("{seat}", label));
const lastSeatPatch = () =>
  actions.seatingSeatAction.mock.calls.at(-1)!.at(-1) as Record<
    string,
    unknown
  >;

describe("éditeur de plan de salle : places et mode de placement", () => {
  it("recherche d'une place, sans tenir compte des majuscules : ses réglages s'ouvrent ; place inconnue signalée", () => {
    draw();
    find("a", "3");
    expect(
      screen.getByText((c) => norm(c) === seatTitle("A", "3")),
    ).toBeTruthy();
    find("Z", "99");
    expect(screen.getByText(t.notFound!)).toBeTruthy();
  });

  it("place vendue : ni renumérotée ni bloquée, seules l'accessibilité et la note partent", async () => {
    draw();
    find("A", "2");
    expect(
      (document.getElementById("seat-label") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: t.blocked }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: t.accessible }));
    fireEvent.change(document.getElementById("seat-note")!, {
      target: { value: "  Fauteuil roulant  " },
    });
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: t.saveSeat })),
    );
    await waitFor(() => expect(actions.seatingSeatAction).toHaveBeenCalled());
    expect(lastSeatPatch()).toEqual({
      accessible: true,
      note: "Fauteuil roulant",
    });
  });

  it("place libre : nouveau numéro et blocage envoyés", async () => {
    draw();
    find("A", "3");
    fireEvent.change(document.getElementById("seat-label")!, {
      target: { value: " 3bis " },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: t.blocked }));
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: t.saveSeat })),
    );
    await waitFor(() => expect(actions.seatingSeatAction).toHaveBeenCalled());
    expect(lastSeatPatch()).toMatchObject({
      label: "3bis",
      blocked: true,
      accessible: false,
      note: null,
    });
  });

  it("mode de placement refusé par le serveur : l'interrupteur revient et le motif s'affiche ; sans places numérotées, pas de choix de place", async () => {
    for (const f of Object.values(actions))
      f.mockResolvedValue({ ok: false, error: "SEATING_TYPES_UNMAPPED" });
    const a = draw();
    const box = (label: string) =>
      screen
        .getAllByRole("checkbox")
        .find((x) =>
          (x.closest("label")?.textContent ?? "").includes(label),
        ) as HTMLInputElement;
    expect(box(t.assigned!).checked).toBe(true);
    await act(async () => void fireEvent.click(box(t.assigned!)));
    await waitFor(() => expect(box(t.assigned!).checked).toBe(true)); // refusé : toujours en places numérotées
    expect(
      screen.getByText(
        (c) => norm(c) === norm(t.error_SEATING_TYPES_UNMAPPED!),
      ),
    ).toBeTruthy();
    a.unmount();
    draw(
      state({ mode: "GENERAL", hasSales: false, seats: [seat(1), seat(3)] }),
    );
    expect(box(t.choice!).disabled).toBe(true);
  });
});
