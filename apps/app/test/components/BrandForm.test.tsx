import { contrastRatio, inkOn, palette } from "@evoly/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { BrandForm, type BrandValues } from "@/app/o/[orgSlug]/brand/BrandClient";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  addDomainAction: vi.fn(),
  changeSubdomainAction: vi.fn(),
  checkSubdomainAction: vi.fn(),
  domainCommandAction: vi.fn(),
  saveBrandAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/brand/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).brand!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const ratio = (c: string) => Math.round(contrastRatio(c, inkOn(c)) * 10) / 10;
const contrastText = (c: string) => norm(t.contrast!.replace("{ratio}", String(ratio(c)).replace(".", ",")));
const contrastAlt = (c: string) => norm(t.contrast!.replace("{ratio}", String(ratio(c))));
const values = (over: Partial<BrandValues> = {}): BrandValues => ({
  displayName: "Club",
  logoUrl: "",
  faviconUrl: "",
  primaryColor: "#1B4D8C",
  accentColor: "#FFB8E8",
  emailFromName: "Club",
  emailReplyTo: "",
  hideEvolyBranding: false,
  ...over,
});
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.unstubAllGlobals());
const draw = (v = values(), canHide = true) =>
  render(
    <Fr>
      <BrandForm orgSlug="club" values={v} organizationName="Club" canHide={canHide} />
    </Fr>,
  );
const hasContrast = (c: string) => screen.getAllByText((x) => [contrastText(c), contrastAlt(c)].includes(norm(x))).length > 0;

describe("configurateur de la marque (US-BRD-01, RG-BRD-01)", () => {
  it("contraste calculé en direct pour chaque couleur ; couleur illisible : celle de la palette", () => {
    draw();
    expect(hasContrast("#1B4D8C")).toBe(true);
    fireEvent.change(document.getElementById("primaryColor")!, { target: { value: "pas-une-couleur" } });
    expect(hasContrast(palette.charbon)).toBe(true);
    fireEvent.change(screen.getByLabelText(t.primaryColor!, { selector: 'input[type="color"]' }), { target: { value: "#ff0000" } });
    expect((document.getElementById("primaryColor") as HTMLInputElement).value).toBe("#FF0000"); // en majuscules
    expect(hasContrast("#FF0000")).toBe(true);
  });

  it("logo envoyé : affiché ; envoi refusé : expliqué ; logo retiré", async () => {
    let reply: unknown = { url: "https://cdn.evoly.me/orgs/o1/logo.png" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(reply))),
    );
    const { container } = draw();
    const input = container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    await act(async () => void fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } }));
    await waitFor(() => expect(screen.getByAltText(t.logoAlt!).getAttribute("src")).toBe("https://cdn.evoly.me/orgs/o1/logo.png"));
    fireEvent.click(screen.getByRole("button", { name: t.removeLogo }));
    expect(screen.queryByAltText(t.logoAlt!)).toBeNull();
    reply = { error: "QUELQUE_CHOSE" };
    await act(async () => void fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } }));
    expect(await screen.findByText(t.upload_UNKNOWN!)).toBeTruthy();
  });

  it("retrait de la mention Evoly : proposé seulement si l'offre l'autorise, et appliqué à l'aperçu", () => {
    const a = draw(values(), false);
    expect(screen.queryByRole("checkbox", { name: t.hideEvolyBranding })).toBeNull();
    expect(screen.getByText(t.poweredBy!)).toBeTruthy();
    a.unmount();
    draw(values(), true);
    fireEvent.click(screen.getByRole("checkbox", { name: t.hideEvolyBranding }));
    expect(screen.queryByText(t.poweredBy!)).toBeNull();
  });

  it("enregistrement : couleurs, nom d'expéditeur et retrait envoyés, puis confirmés", async () => {
    draw(values({ hideEvolyBranding: true }));
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.save }).closest("form")!));
    await waitFor(() => expect(actions.saveBrandAction).toHaveBeenCalled());
    const data = actions.saveBrandAction.mock.calls[0]!.at(-1) as FormData;
    expect([data.get("primaryColor"), data.get("accentColor"), data.get("emailFromName"), data.get("hideEvolyBranding")]).toEqual([
      "#1B4D8C",
      "#FFB8E8",
      "Club",
      "on",
    ]);
    expect(await screen.findByText(t.saved!)).toBeTruthy();
  });
});
