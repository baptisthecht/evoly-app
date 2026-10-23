import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { CancelEvent } from "@/app/o/[orgSlug]/events/[eventId]/CancelEvent";
import { EventPublication } from "@/app/o/[orgSlug]/events/[eventId]/settings/EventPublication";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  cancelEventAction: vi.fn(),
  savePublicationAction: vi.fn(),
  previewLinkAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const ev = fr.events as unknown as Record<string, string>;
const pub = fr.publication as Record<string, string>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);

describe("annulation d'un événement : double confirmation (RG-REF-07)", () => {
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: ev.cancelEvent }));
  it("avertissement avec le nombre de commandes payées ; « annuler » referme", () => {
    wrap(
      <CancelEvent
        orgSlug="club"
        eventId="e1"
        title="Gala de printemps"
        paidOrders={12}
      />,
    );
    open();
    expect(screen.getByText((c) => c.includes("12"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ev.cancelAbort }));
    expect(screen.getByRole("button", { name: ev.cancelEvent })).toBeTruthy();
  });

  it("titre mal recopié : signalé ; titre exact, espaces autour ignorés : rien à signaler", () => {
    wrap(
      <CancelEvent
        orgSlug="club"
        eventId="e1"
        title="Gala de printemps"
        paidOrders={0}
      />,
    );
    open();
    const field = screen.getByRole("textbox", {
      name: (n) => norm(n).includes("Gala de printemps"),
    });
    fireEvent.change(field, { target: { value: "Gala" } });
    expect(screen.getByText(ev.cancelTitleMismatch!)).toBeTruthy();
    fireEvent.change(field, { target: { value: "  Gala de printemps  " } });
    expect(screen.queryByText(ev.cancelTitleMismatch!)).toBeNull();
  });

  it("motif et confirmation envoyés ; refus du serveur affiché", async () => {
    actions.cancelEventAction.mockResolvedValue({
      ok: false,
      error: "CANCEL_CONFIRMATION_MISMATCH",
    });
    wrap(
      <CancelEvent orgSlug="club" eventId="e1" title="Gala" paidOrders={3} />,
    );
    open();
    fireEvent.change(screen.getByLabelText(new RegExp(ev.cancelReason!)), {
      target: { value: "Intempéries" },
    });
    fireEvent.change(
      screen.getByRole("textbox", {
        name: (n) =>
          norm(n).includes("Gala") && !norm(n).includes(norm(ev.cancelReason!)),
      }),
      {
        target: { value: "Gala" },
      },
    );
    await act(
      async () =>
        void fireEvent.submit(
          screen
            .getByRole("button", { name: ev.cancelSubmit })
            .closest("form")!,
        ),
    );
    await waitFor(() => expect(actions.cancelEventAction).toHaveBeenCalled());
    const data = actions.cancelEventAction.mock.calls[0]!.at(-1) as FormData;
    expect([data.get("reason"), data.get("confirmation")]).toEqual([
      "Intempéries",
      "Gala",
    ]);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

const props = (
  over: Partial<Parameters<typeof EventPublication>[0]> = {},
): Parameters<typeof EventPublication>[0] => ({
  orgSlug: "club",
  eventId: "e1",
  timezone: "Europe/Brussels",
  publishLocal: null,
  mode: "HIDDEN",
  teaserText: null,
  previewUrl: null,
  status: null,
  waiting: 0,
  readOnly: false,
  ...over,
});
const save = () =>
  screen.getByRole("button", { name: pub.save }) as HTMLButtonElement;
describe("mise en ligne d'un événement (RG-PRG-01 à 03)", () => {
  it("publication immédiate : enregistrée sans date, puis confirmée", async () => {
    actions.savePublicationAction.mockResolvedValue({ ok: true, data: null });
    wrap(<EventPublication {...props()} />);
    await act(async () => void fireEvent.click(save()));
    expect(actions.savePublicationAction).toHaveBeenCalledWith("club", "e1", {
      publishLocal: null,
      mode: "HIDDEN",
      teaserText: null,
    });
    expect((await screen.findByRole("status")).textContent).toBe(pub.saved);
  });

  it("programmée : date obligatoire ; présentation avant l'heure avec son texte nettoyé, ou cachée sans texte", async () => {
    actions.savePublicationAction.mockResolvedValue({ ok: true, data: null });
    wrap(<EventPublication {...props()} />);
    fireEvent.click(screen.getByLabelText(pub.optScheduled!));
    expect(save().disabled).toBe(true);
    fireEvent.change(
      screen.getByLabelText((l) =>
        norm(l).startsWith(norm(pub.dateLabel!.split("{")[0]!)),
      ),
      { target: { value: "2026-11-01T10:00" } },
    );
    expect(save().disabled).toBe(false);
    const radios = screen
      .getAllByRole("radio")
      .filter((r) => (r as HTMLInputElement).name === "publication-mode");
    fireEvent.click(radios[1]!); // TEASER
    fireEvent.change(screen.getByLabelText(pub.teaserLabel!), {
      target: { value: "  Bientôt en vente  " },
    });
    await act(async () => void fireEvent.click(save()));
    expect(actions.savePublicationAction).toHaveBeenLastCalledWith(
      "club",
      "e1",
      {
        publishLocal: "2026-11-01T10:00",
        mode: "TEASER",
        teaserText: "Bientôt en vente",
      },
    );
    fireEvent.click(radios[0]!); // HIDDEN
    await act(async () => void fireEvent.click(save()));
    expect(actions.savePublicationAction).toHaveBeenLastCalledWith(
      "club",
      "e1",
      { publishLocal: "2026-11-01T10:00", mode: "HIDDEN", teaserText: null },
    );
  });

  it("refus : erreur traduite si elle est connue, sinon message générique", async () => {
    const known = Object.keys(fr.errors as Record<string, string>)[0]!;
    wrap(<EventPublication {...props()} />);
    actions.savePublicationAction.mockResolvedValue({
      ok: false,
      error: known,
    });
    await act(async () => void fireEvent.click(save()));
    expect((await screen.findByRole("status")).textContent).toBe(
      (fr.errors as Record<string, string>)[known],
    );
    actions.savePublicationAction.mockResolvedValue({
      ok: false,
      error: "INCONNUE",
    });
    await act(async () => void fireEvent.click(save()));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(pub.error),
    );
  });

  it("lien d'aperçu secret : création, copie, révocation", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    actions.previewLinkAction.mockResolvedValue({ ok: true, data: null });
    const a = wrap(<EventPublication {...props()} />);
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: pub.previewCreate }),
        ),
    );
    expect(actions.previewLinkAction).toHaveBeenLastCalledWith(
      "club",
      "e1",
      true,
    );
    a.unmount();
    wrap(
      <EventPublication
        {...props({ previewUrl: "https://club.evoly.me/gala?apercu=secret" })}
      />,
    );
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: pub.previewCopy }),
        ),
    );
    expect(writeText).toHaveBeenCalledWith(
      "https://club.evoly.me/gala?apercu=secret",
    );
    expect(
      screen.getByRole("button", { name: pub.previewCopied }),
    ).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_100)));
    expect(screen.getByRole("button", { name: pub.previewCopy })).toBeTruthy();
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: pub.previewRevoke }),
        ),
    );
    expect(actions.previewLinkAction).toHaveBeenLastCalledWith(
      "club",
      "e1",
      false,
    );
  });

  it("lecture seule : aucune action possible ; état et alertes en attente affichés", () => {
    wrap(
      <EventPublication
        {...props({
          readOnly: true,
          status: "Publication prévue le 1er novembre.",
          waiting: 7,
          previewUrl: "https://x",
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: pub.save })).toBeNull();
    expect(
      screen.queryByRole("button", { name: pub.previewRevoke }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("7");
    expect(
      (screen.getAllByRole("radio")[0] as HTMLInputElement).closest("fieldset")!
        .disabled,
    ).toBe(true);
  });
});
