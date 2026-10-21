import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EmailEditor } from "@/components/email/EmailEditor";
import { Fr } from "./intl";

const brand = vi.hoisted(() => ({ uploadFile: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/brand/BrandClient", () => brand);
const e = (fr as unknown as Record<string, Record<string, string>>).emailEditor!;
// ProseMirror mesure l'écran : le navigateur simulé ne le fait pas
beforeAll(() => {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
  document.elementFromPoint = () => null;
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});
beforeEach(() => brand.uploadFile.mockReset());
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] };
const types = (doc: Node): string[] => [doc.type, ...(doc.content ?? []).flatMap(types)];
const start = { type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Bonjour" }] }] };
const draw = async (props: { events?: Array<{ id: string; title: string }>; allowHtml?: boolean } = {}) => {
  const onChange = vi.fn();
  render(
    <Fr>
      <EmailEditor orgSlug="club" value={start} onChange={onChange} events={props.events ?? [{ id: "e1", title: "Gala" }]} allowHtml={props.allowHtml} />
    </Fr>,
  );
  const tools = within(await screen.findByRole("toolbar", { name: e.insert }));
  const last = () => onChange.mock.calls.at(-1)![0] as Node;
  return { onChange, tools, last };
};

describe("éditeur riche des e-mails", () => {
  it("insertions : bouton, carte d'événement, prénom, séparateur et HTML, dans le document transmis", async () => {
    const { tools, last } = await draw();
    expect(screen.getByRole("textbox", { name: e.content }).textContent).toContain("Bonjour");
    for (const label of [e.button, e.event, e.firstName, e.divider, e.html])
      await act(async () => void fireEvent.click(tools.getByRole("button", { name: label })));
    const found = types(last());
    for (const type of ["button", "eventCard", "mergeTag", "horizontalRule", "rawHtml"]) expect(found).toContain(type);
    const flat = (n: Node): Node[] => [n, ...(n.content ?? []).flatMap(flat)];
    expect(flat(last()).find((n) => n.type === "eventCard")!.attrs).toMatchObject({ eventId: "e1" });
    expect(flat(last()).find((n) => n.type === "mergeTag")!.attrs).toMatchObject({ name: "prenom" });
  });

  it("sans événement et sans HTML autorisé : ces outils ne sont pas proposés", async () => {
    const { tools } = await draw({ events: [], allowHtml: false });
    expect(tools.queryByRole("button", { name: e.event })).toBeNull();
    expect(tools.queryByRole("button", { name: e.html })).toBeNull();
    expect(tools.getByRole("button", { name: e.button })).toBeTruthy();
  });

  it("style du texte : le paragraphe devient un titre", async () => {
    const { last } = await draw();
    await act(async () => void fireEvent.change(screen.getByRole("combobox", { name: e.style }), { target: { value: "h2" } }));
    const flat = (n: Node): Node[] => [n, ...(n.content ?? []).flatMap(flat)];
    expect(flat(last()).find((n) => n.type === "heading")!.attrs).toMatchObject({ level: 2 });
  });

  it("image : envoyée puis insérée ; envoi refusé : expliqué", async () => {
    const { last } = await draw();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    brand.uploadFile.mockResolvedValueOnce({ url: "https://cdn.evoly.me/orgs/o1/campagne.png" });
    await act(async () => void fireEvent.change(input, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } }));
    await waitFor(() => expect(types(last())).toContain("image"));
    expect(brand.uploadFile).toHaveBeenCalledWith("club", expect.any(File), "campaign");
    brand.uploadFile.mockResolvedValueOnce({ error: "TOO_LARGE" });
    await act(async () => void fireEvent.change(input, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } }));
    expect(await screen.findByText(e.uploadFailed!)).toBeTruthy();
  });

  it("annuler : l'insertion est retirée", async () => {
    const { tools, last } = await draw();
    await act(async () => void fireEvent.click(tools.getByRole("button", { name: e.spacer })));
    expect(types(last())).toContain("spacer");
    await act(async () => void fireEvent.click(within(screen.getByRole("toolbar", { name: e.toolbar })).getByRole("button", { name: e.undo })));
    expect(types(last())).not.toContain("spacer");
  });
});

describe("éditeur riche des e-mails : historique", () => {
  it("annuler retire la dernière insertion du document transmis ; rétablir la remet", async () => {
    const { tools, last } = await draw();
    await act(async () => void fireEvent.click(tools.getByRole("button", { name: e.divider })));
    expect(types(last())).toContain("horizontalRule");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: e.undo })));
    expect(types(last())).not.toContain("horizontalRule");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: e.redo })));
    expect(types(last())).toContain("horizontalRule");
  });
});
