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

describe("éditeur riche des e-mails : barre d'outils", () => {
  type Doc = { type: string; attrs?: Record<string, unknown>; content?: Doc[] };
  const nodes = (n: Doc): Doc[] => [n, ...(n.content ?? []).flatMap(nodes)];

  it("liste à puces puis liste numérotée : présentes dans le document transmis", async () => {
    const { last } = await draw(); // outils de mise en forme : barre distincte de celle des insertions
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: e.bulletList })));
    expect(types(last())).toContain("bulletList");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: e.orderedList })));
    expect(types(last())).toContain("orderedList");
  });

  it("citation : appliquée à un paragraphe", async () => {
    const { last } = await draw();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: e.quote })));
    expect(types(last())).toContain("blockquote");
  });

  it("alignement centré : posé sur le paragraphe", async () => {
    const { last } = await draw(); // outils de mise en forme : barre distincte de celle des insertions
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: e.alignCenter })));
    expect(nodes(last() as Doc).some((n) => n.type === "paragraph" && n.attrs?.textAlign === "center")).toBe(true);
  });

  it("titre puis paragraphe : le style revient au paragraphe", async () => {
    const { last } = await draw(); // outils de mise en forme : barre distincte de celle des insertions
    await act(async () => void fireEvent.change(screen.getByLabelText(e.style!), { target: { value: "h2" } }));
    expect(types(last())).toContain("heading");
    await act(async () => void fireEvent.change(screen.getByLabelText(e.style!), { target: { value: "p" } }));
    expect(types(last())).not.toContain("heading");
  });
});
