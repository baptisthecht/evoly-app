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

describe("éditeur de plan de salle : plan à partir d'une photo", () => {
  const empty = () => state({ blocks: [], seats: [], rows: [] });
  const withPhoto = (enabled: boolean) =>
    render(
      <Fr>
        <SeatingEditor orgSlug="club" eventId="e1" state={empty()} layouts={[]} heat={null} photoEnabled={enabled} readOnly={false} />
      </Fr>,
    );
  const plan = { blocks: [{ kind: "rows", name: "Parterre", x: 0, y: 0, rotation: 0, params: { rows: 2, seats: 4 } }] };
  const analyse = async () => {
    const input = document.getElementById("photo-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "salle.jpg", { type: "image/jpeg" })] } });
    await act(async () => void fireEvent.submit(input.closest("form")!));
  };

  it("fonction désactivée : indisponible", () => {
    withPhoto(false);
    expect(norm(document.body.textContent!)).toContain(norm(t.photoUnavailable!));
    expect(document.getElementById("photo-file")).toBeNull();
  });

  it("photo illisible : l'erreur est expliquée, aucun plan appliqué", async () => {
    actions.seatingPhotoAction.mockResolvedValueOnce({ ok: false, error: "PHOTO_ILLISIBLE_INCONNUE" });
    withPhoto(true);
    await analyse();
    await waitFor(() => expect(norm(document.body.textContent!)).toContain(norm(t.errorGeneric!)));
    expect(actions.seatingPhotoApplyAction).not.toHaveBeenCalled();
  });

  it("photo analysée : proposition affichée, « appliquer » envoie exactement le plan proposé", async () => {
    actions.seatingPhotoAction.mockResolvedValueOnce({ ok: true, data: plan });
    withPhoto(true);
    await analyse();
    expect(await screen.findByRole("status")).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.photoApply })));
    await waitFor(() => expect(actions.seatingPhotoApplyAction).toHaveBeenCalled());
    expect(actions.seatingPhotoApplyAction.mock.calls.at(-1)![2]).toEqual(plan);
  });
});
