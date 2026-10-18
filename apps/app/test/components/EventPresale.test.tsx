import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EventPresale } from "@/app/o/[orgSlug]/events/[eventId]/settings/EventPresale";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ generatePresaleCodesAction: vi.fn(), savePresaleStartAction: vi.fn(), setPresaleCodeActiveAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const fr2 = fr as unknown as Record<string, Record<string, string>>;
const ns = Object.keys(fr2).find((k) => fr2[k]?.generateTitle && fr2[k]?.copyLink)!; // espace de traduction de la prévente
const t = fr2[ns]!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const fill = (msg: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), msg);
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: 3 });
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const overview = (codes: Array<{ id: string; code: string; label: string | null; active: boolean }> = [], count = codes.length) => ({
  count,
  used: 1,
  capacity: 10,
  codes: codes.map((c) => ({ ...c, usedCount: 0, maxUses: 1 })),
});
const draw = (over: Record<string, unknown> = {}) =>
  render(
    <Fr>
      <EventPresale
        {...({
          orgSlug: "club",
          eventId: "e1",
          timezone: "Europe/Brussels",
          startsLocal: null,
          eventUrl: "https://club.evoly.me/gala",
          readOnly: false,
          overview: overview(),
          ...over,
        } as unknown as Parameters<typeof EventPresale>[0])}
      />
    </Fr>,
  );
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

describe("prévente privée (RG-PRV-01, RG-PRV-02)", () => {
  it("génération : quantité et utilisations envoyées, nombre de codes créés annoncé", async () => {
    draw();
    fireEvent.change(field("presaleQuantity"), { target: { value: "3" } });
    fireEvent.change(field("presaleUses"), { target: { value: "2" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.generate })));
    expect(actions.generatePresaleCodesAction).toHaveBeenCalledWith("club", "e1", expect.objectContaining({ customCode: null }));
    expect(JSON.stringify(actions.generatePresaleCodesAction.mock.calls[0]![2])).toMatch(/3/);
    const status = (await screen.findByRole("status")).textContent!;
    expect(status).toContain("3"); // « 3 codes créés. » : le pluriel est appliqué
    expect(status).not.toContain("{");
  });

  it("code personnalisé : seulement pour un code unique, mis en majuscules", async () => {
    draw();
    expect(field("presaleCustom")).not.toBeNull();
    fireEvent.change(field("presaleCustom"), { target: { value: "vip-2026" } });
    expect(field("presaleCustom").value).toBe("VIP-2026");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.generate })));
    expect(actions.generatePresaleCodesAction.mock.calls[0]![2]).toMatchObject({ customCode: "VIP-2026" });
    fireEvent.change(field("presaleQuantity"), { target: { value: "5" } });
    expect(field("presaleCustom")).toBeNull();
  });

  it("début de la prévente enregistré, ou effacé", async () => {
    draw({ startsLocal: "2026-11-01T10:00" });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.saveStart })));
    expect(actions.savePresaleStartAction).toHaveBeenLastCalledWith("club", "e1", "2026-11-01T10:00");
    fireEvent.change(field("presaleStart"), { target: { value: "" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.saveStart })));
    expect(actions.savePresaleStartAction).toHaveBeenLastCalledWith("club", "e1", null);
    expect((await screen.findByRole("status")).textContent).toBe(t.saved);
  });

  it("refus : erreur traduite si connue, sinon message générique", async () => {
    const errors = fr.errors as Record<string, string>;
    const known = Object.keys(errors)[0]!;
    draw();
    actions.savePresaleStartAction.mockResolvedValue({ ok: false, error: known });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.saveStart })));
    expect((await screen.findByRole("status")).textContent).toBe(errors[known]);
    actions.generatePresaleCodesAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.generate })));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(t.error));
  });

  it("lien d'un code : copié avec le code encodé dans l'adresse", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    draw({ overview: overview([{ id: "c1", code: "VIP 2026", label: "Partenaires", active: true }]) });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.copyLink })));
    expect(writeText).toHaveBeenCalledWith("https://club.evoly.me/gala?prevente=VIP%202026");
    expect(screen.getByRole("button", { name: t.copied })).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_100)));
    expect(screen.getByRole("button", { name: t.copyLink })).toBeTruthy();
  });

  it("code désactivé ou réactivé, avec sa mention ; plus de codes que la liste : mention « les derniers »", async () => {
    draw({
      overview: overview(
        [
          { id: "c1", code: "A1", label: null, active: true },
          { id: "c2", code: "B2", label: null, active: false },
        ],
        40,
      ),
    });
    expect(screen.getByText((c) => c.includes(t.disabled!))).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.disable })));
    expect(actions.setPresaleCodeActiveAction).toHaveBeenLastCalledWith("club", "e1", "c1", false);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: t.enable })));
    expect(actions.setPresaleCodeActiveAction).toHaveBeenLastCalledWith("club", "e1", "c2", true);
    expect(screen.getByText(t.latest!)).toBeTruthy();
    expect(screen.getByText(t.export!)).toBeTruthy();
  });

  it("lecture seule : ni génération, ni enregistrement, ni désactivation ; sans code : mention « aucun »", () => {
    const a = draw({ readOnly: true, overview: overview([{ id: "c1", code: "A1", label: null, active: true }]) });
    expect(screen.queryByRole("button", { name: t.generate })).toBeNull();
    expect(screen.queryByRole("button", { name: t.saveStart })).toBeNull();
    expect(screen.queryByRole("button", { name: t.disable })).toBeNull();
    a.unmount();
    draw();
    expect(screen.getByText(t.none!)).toBeTruthy();
  });
});
