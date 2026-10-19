import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EventAppearance } from "@/app/o/[orgSlug]/events/[eventId]/settings/EventAppearance";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ checkSubdomainAction: vi.fn(), eventCoverAction: vi.fn(), eventSubdomainAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/brand/actions", () => actions);
const brand = vi.hoisted(() => ({ uploadFile: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/brand/BrandClient", () => brand);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const t = (fr as unknown as Record<string, Record<string, string>>).brand!;
beforeEach(() => {
  for (const f of [...Object.values(actions), brand.uploadFile, router.refresh]) f.mockReset();
  actions.eventSubdomainAction.mockResolvedValue({ ok: true, data: null });
});
afterEach(() => vi.useRealTimers());
const draw = (over: Partial<Parameters<typeof EventAppearance>[0]> = {}) =>
  render(
    <Fr>
      <EventAppearance orgSlug="club" eventId="e1" cover={null} subdomain={null} baseDomain="evoly.me" canSubdomain protocol="https:" {...over} />
    </Fr>,
  );
const field = () => screen.getByRole("textbox", { name: t.eventSubdomainTitle });

describe("apparence d'un événement : adresse dédiée (RG-SDM-04, Pro)", () => {
  it("une réponse arrivée en retard ne s'affiche jamais pour une autre adresse", async () => {
    vi.useFakeTimers();
    const replies: Array<(v: unknown) => void> = [];
    actions.checkSubdomainAction.mockImplementation(() => new Promise((ok) => replies.push(ok)));
    draw();
    fireEvent.change(field(), { target: { value: "gala" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    fireEvent.change(field(), { target: { value: "gala-2026" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(305)));
    expect(actions.checkSubdomainAction.mock.calls.map((c) => c[1])).toEqual(["gala", "gala-2026"]);
    await act(async () => replies[1]!({ ok: false, reason: "TAKEN" }));
    await act(async () => replies[0]!({ ok: true })); // en retard : pour « gala »
    expect(screen.getByText(t.unavailable_TAKEN!)).toBeTruthy();
    expect(screen.queryByText(t.available!)).toBeNull();
  });

  it("adresse inchangée : aucune vérification ; vidée alors qu'il y en a une : « retirer »", async () => {
    vi.useFakeTimers();
    draw({ subdomain: "gala" });
    await act(async () => void (await vi.advanceTimersByTimeAsync(400)));
    expect(actions.checkSubdomainAction).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "gala.evoly.me" }).getAttribute("href")).toBe("https://gala.evoly.me");
    fireEvent.change(field(), { target: { value: "" } });
    expect(screen.getByRole("button", { name: t.eventSubdomainRemove })).toBeTruthy();
  });

  it("adresse saisie en majuscules : mise en minuscules ; enregistrée puis la page est rafraîchie", async () => {
    draw();
    fireEvent.change(field(), { target: { value: "GALA" } });
    expect((field() as HTMLInputElement).value).toBe("gala");
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: t.eventSubdomainSave }).closest("form")!));
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("sans l'offre Pro : l'adresse dédiée est seulement présentée", () => {
    draw({ canSubdomain: false });
    expect(screen.queryByRole("textbox", { name: t.eventSubdomainTitle })).toBeNull();
    expect(screen.getByText(t.eventSubdomainUpsell!)).toBeTruthy();
  });
});

describe("apparence d'un événement : couverture", () => {
  it("couverture envoyée puis enregistrée ; refus de l'envoi expliqué ; couverture retirée", async () => {
    const a = draw();
    brand.uploadFile.mockResolvedValue({ url: "https://cdn.evoly.me/events/e1/cover.png" });
    await act(
      async () => void fireEvent.change(screen.getByTestId("cover-input"), { target: { files: [new File(["x"], "cover.png", { type: "image/png" })] } }),
    );
    expect(brand.uploadFile).toHaveBeenCalledWith("club", expect.any(File), "cover", "e1");
    expect(actions.eventCoverAction).toHaveBeenCalledWith("club", "e1", "https://cdn.evoly.me/events/e1/cover.png");
    brand.uploadFile.mockResolvedValue({ error: "QUELQUE_CHOSE" });
    await act(
      async () => void fireEvent.change(screen.getByTestId("cover-input"), { target: { files: [new File(["x"], "cover.png", { type: "image/png" })] } }),
    );
    expect(screen.getByText(t.upload_UNKNOWN!)).toBeTruthy();
    a.unmount();
    draw({ cover: "https://cdn.evoly.me/events/e1/cover.png" });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.removeCover })));
    expect(actions.eventCoverAction).toHaveBeenLastCalledWith("club", "e1", null);
  });
});
