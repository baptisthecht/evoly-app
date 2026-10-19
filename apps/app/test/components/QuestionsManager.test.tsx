import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { QuestionsManager } from "@/app/o/[orgSlug]/events/[eventId]/tickets/QuestionsManager";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ questionCommandAction: vi.fn(), saveQuestionAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).questions!;
// espaces insécables de la ponctuation française : comparés après la même normalisation des deux côtés
const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const text = (wanted: string) => (c: string) => norm(c) === norm(wanted);
type Q = Parameters<typeof QuestionsManager>[0]["questions"][number];
const q = (id: string, over: Partial<Q> = {}): Q => ({
  id,
  label: `Question ${id}`,
  helpText: null,
  type: "TEXT",
  options: null,
  required: false,
  scope: "ORDER",
  ticketTypeIds: [],
  archived: false,
  answers: 0,
  ...over,
});
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: { outcome: "DELETED" } });
  }
});
afterEach(() => vi.restoreAllMocks());
const draw = (questions: Q[], readOnly = false) =>
  render(
    <Fr>
      <QuestionsManager orgSlug="club" eventId="e1" questions={questions} ticketTypes={[{ id: "t1", name: "Fosse" }]} readOnly={readOnly} />
    </Fr>,
  );

describe("questions posées à l'acheteur, côté organisateur (US-QST-01)", () => {
  it("question avec réponses : archivée pour garder les réponses ; sans réponse : supprimée ; confirmation annulée : rien", async () => {
    draw([q("a", { answers: 4 }), q("b")]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: t.archive }));
    expect(confirm).toHaveBeenLastCalledWith(t.confirmArchive);
    expect(actions.questionCommandAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    actions.questionCommandAction.mockResolvedValue({ ok: true, data: { outcome: "ARCHIVED" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.archive })));
    expect(actions.questionCommandAction).toHaveBeenLastCalledWith("club", "e1", "a", "remove");
    expect(await screen.findByText(text(t.archived!))).toBeTruthy();
    actions.questionCommandAction.mockResolvedValue({ ok: true, data: { outcome: "DELETED" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.delete })));
    expect(confirm).toHaveBeenLastCalledWith(t.confirmDelete);
    expect(await screen.findByText(text(t.deleted!))).toBeTruthy();
  });

  it("flèches de déplacement arrêtées aux extrémités ; déplacement envoyé", async () => {
    draw([q("a"), q("b"), q("c")]);
    const ups = screen.getAllByRole("button", { name: t.up }) as HTMLButtonElement[];
    const downs = screen.getAllByRole("button", { name: t.down }) as HTMLButtonElement[];
    expect([ups[0]!.disabled, downs.at(-1)!.disabled, ups[1]!.disabled]).toEqual([true, true, false]);
    await act(async () => void fireEvent.click(ups[1]!));
    expect(actions.questionCommandAction).toHaveBeenLastCalledWith("club", "e1", "b", "up");
  });

  it("export des réponses seulement s'il y en a ; questions archivées comptées", () => {
    const a = draw([q("a")]);
    expect(screen.queryByRole("link", { name: t.export })).toBeNull();
    a.unmount();
    draw([q("a", { answers: 2 }), q("z", { archived: true })]);
    expect(screen.getByRole("link", { name: t.export }).getAttribute("href")).toBe("/o/club/events/e1/questions/export");
  });

  it("nouvelle question à choix : les choix sont demandés ; enregistrée puis le formulaire se referme", async () => {
    draw([]);
    fireEvent.click(screen.getByRole("button", { name: `+ ${t.add}` }));
    expect(document.getElementById("qo-new")).toBeNull();
    fireEvent.change(document.getElementById("qt-new")!, { target: { value: "SELECT" } });
    fireEvent.change(document.getElementById("qo-new")!, { target: { value: "S\nM\nL" } });
    fireEvent.change(document.getElementById("ql-new")!, { target: { value: "Taille du t-shirt" } });
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.save }).closest("form")!));
    await waitFor(() => expect(actions.saveQuestionAction).toHaveBeenCalledTimes(1));
    const data = actions.saveQuestionAction.mock.calls[0]!.at(-1) as FormData;
    expect([data.get("label"), data.get("type"), data.get("options"), data.get("scope")]).toEqual(["Taille du t-shirt", "SELECT", "S\nM\nL", "ORDER"]);
    await waitFor(() => expect(screen.getByRole("button", { name: `+ ${t.add}` })).toBeTruthy()); // refermé
  });

  it("lecture seule : aucune modification possible", () => {
    draw([q("a", { answers: 1 })], true);
    for (const name of [t.edit, t.archive, t.up, `+ ${t.add}`]) expect(screen.queryByRole("button", { name })).toBeNull();
  });
});
