import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  LinkActions,
  NewScannerLink,
  OpenScanner,
} from "@/app/o/[orgSlug]/events/[eventId]/entries/EntriesClient";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  createScannerLinkAction: vi.fn(),
  openScannerAction: vi.fn(),
  revokeScannerLinkAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).entries!;
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.restoreAllMocks());
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);
const box = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("liens des bénévoles du scanner (RG-SCN-01, RG-SCN-07)", () => {
  it("nouveau lien : valeurs par défaut sûres (recherche manuelle oui, vérification seule et vente non, jour de l'événement)", () => {
    wrap(<NewScannerLink orgSlug="club" eventId="e1" />);
    fireEvent.click(screen.getByRole("button", { name: `+ ${t.newLink}` }));
    expect([
      box(t.allowManualSearch!).checked,
      box(t.checkOnly!).checked,
      box(t.canSell!).checked,
    ]).toEqual([true, false, false]);
    expect(
      (document.getElementById("link-duration") as HTMLSelectElement).value,
    ).toBe("EVENT_DAY");
    expect(document.getElementById("link-expiry")).toBeNull();
  });

  it("échéance personnalisée : la date est demandée", () => {
    wrap(<NewScannerLink orgSlug="club" eventId="e1" />);
    fireEvent.click(screen.getByRole("button", { name: `+ ${t.newLink}` }));
    fireEvent.change(document.getElementById("link-duration")!, {
      target: { value: "CUSTOM" },
    });
    expect(
      (document.getElementById("link-expiry") as HTMLInputElement).required,
    ).toBe(true);
  });

  it("création : réglages envoyés, puis le formulaire se referme", async () => {
    wrap(<NewScannerLink orgSlug="club" eventId="e1" />);
    fireEvent.click(screen.getByRole("button", { name: `+ ${t.newLink}` }));
    fireEvent.change(document.getElementById("link-label")!, {
      target: { value: "Porte A" },
    });
    fireEvent.click(box(t.checkOnly!));
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: t.createLink }).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(actions.createScannerLinkAction).toHaveBeenCalled(),
    );
    const data = actions.createScannerLinkAction.mock.calls[0]!.at(
      -1,
    ) as FormData;
    expect([
      data.get("label"),
      data.get("duration"),
      data.get("allowManualSearch"),
      data.get("checkOnly"),
      data.get("canSell"),
    ]).toEqual(["Porte A", "EVENT_DAY", "on", "on", null]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `+ ${t.newLink}` }),
      ).toBeTruthy(),
    );
  });

  const link = (active: boolean) => (
    <LinkActions
      orgSlug="club"
      eventId="e1"
      linkId="l1"
      url="https://scanner.evoly.me/s/jeton"
      qrSvg="<svg></svg>"
      active={active}
    />
  );
  it("lien révoqué : plus aucune action", () => {
    const { container } = wrap(link(false));
    expect(container.textContent).toBe("");
  });

  it("copie du lien et QR code affiché ou masqué", () => {
    wrap(link(true));
    expect(screen.getByRole("button", { name: t.copyLink })).toBeTruthy();
    const qr = screen.getByRole("button", { name: t.showQr });
    fireEvent.click(qr);
    expect([
      qr.getAttribute("aria-expanded"),
      !!screen.queryByLabelText(t.qrLabel!),
    ]).toEqual(["true", true]);
    fireEvent.click(qr);
    expect(screen.queryByLabelText(t.qrLabel!)).toBeNull();
  });

  it("révocation : confirmation annulée, rien n'est révoqué ; acceptée, le lien est révoqué", async () => {
    wrap(link(true));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: t.revoke }).closest("form")!,
        ),
    );
    expect(actions.revokeScannerLinkAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: t.revoke }).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(
        actions.revokeScannerLinkAction.mock.calls[0]!.slice(0, 3),
      ).toEqual(["club", "e1", "l1"]),
    );
  });

  it("ouvrir le scanner depuis le tableau de bord", async () => {
    wrap(<OpenScanner orgSlug="club" eventId="e1" />);
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: t.openScanner }).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(actions.openScannerAction.mock.calls[0]!.slice(0, 2)).toEqual([
        "club",
        "e1",
      ]),
    );
  });
});
