import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { CopyButton } from "@/components/CopyButton";
import { FormError, SubmitButton, useFieldError } from "@/components/forms";
import { AccessGate } from "@/components/public/AccessGate";
import { LookupForm } from "@/components/public/LookupForm";
import { PresaleAutoUnlock } from "@/components/public/PresaleAutoUnlock";
import { ShareFriendLink } from "@/components/public/ShareFriendLink";
import { StickyTicketsButton } from "@/components/public/StickyTicketsButton";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  lookupTicketsAction: vi.fn(),
  unlockEventAction: vi.fn(),
  unlockPresaleAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const nav = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => "/gala",
}));

const o = fr.orders as Record<string, string>;
const p = fr.public as Record<string, string>;
const common = fr.common as Record<string, string>;
const formErrors = fr.formErrors as Record<string, string>;
beforeEach(() => {
  for (const f of [...Object.values(actions), nav.refresh, nav.replace])
    f.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);

describe("retrouver ses billets", () => {
  it("adresse envoyée : confirmation ; refusée : message sous le champ", async () => {
    wrap(<LookupForm sub="club" />);
    fireEvent.change(screen.getByLabelText(new RegExp(o.lookupEmail!)), {
      target: { value: "lea@exemple.be" },
    });
    actions.lookupTicketsAction.mockResolvedValue({
      ok: false,
      error: "INVALID",
    });
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: o.lookupSubmit }).closest("form")!,
        ),
    );
    expect(await screen.findByText(o.lookupInvalid!)).toBeTruthy();
    actions.lookupTicketsAction.mockResolvedValue({ ok: true });
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: o.lookupSubmit }).closest("form")!,
        ),
    );
    expect(actions.lookupTicketsAction).toHaveBeenLastCalledWith(
      "club",
      "lea@exemple.be",
    );
    expect((await screen.findByRole("status")).textContent).toBe(o.lookupSent);
  });
});

describe("événement privé (RG-PUB-06)", () => {
  const submit = () =>
    screen.getByRole("button", { name: p.privateSubmit }) as HTMLButtonElement;
  it("au moins 4 caractères avant de pouvoir valider", () => {
    wrap(<AccessGate eventId="e1" />);
    fireEvent.change(screen.getByLabelText(p.privateCode!), {
      target: { value: "abc" },
    });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(p.privateCode!), {
      target: { value: "abcd" },
    });
    expect(submit().disabled).toBe(false);
  });
  it("bon code : page rafraîchie ; code faux et trop de tentatives : messages distincts", async () => {
    wrap(<AccessGate eventId="e1" />);
    fireEvent.change(screen.getByLabelText(p.privateCode!), {
      target: { value: "VIP2026" },
    });
    actions.unlockEventAction.mockResolvedValue({
      ok: false,
      error: "WRONG_CODE",
    });
    await act(async () => void fireEvent.submit(submit().closest("form")!));
    expect((await screen.findByRole("alert")).textContent).toBe(p.privateWrong);
    actions.unlockEventAction.mockResolvedValue({
      ok: false,
      error: "RATE_LIMITED",
    });
    await act(async () => void fireEvent.submit(submit().closest("form")!));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(p.privateTooMany),
    );
    actions.unlockEventAction.mockResolvedValue({ ok: true });
    await act(async () => void fireEvent.submit(submit().closest("form")!));
    expect(actions.unlockEventAction).toHaveBeenLastCalledWith("e1", "VIP2026");
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });
});

describe("lien de prévente « ?prevente=CODE »", () => {
  const labels = {
    working: "Vérification du code…",
    invalid: "Code de prévente invalide",
    back: "Revenir à la page",
  };
  it("code vérifié une seule fois, même si le composant s'affiche à nouveau ; bon code : adresse nettoyée", async () => {
    actions.unlockPresaleAction.mockResolvedValue({ ok: true });
    const r = render(
      <PresaleAutoUnlock eventId="e1" code="VIP" labels={labels} />,
    );
    r.rerender(<PresaleAutoUnlock eventId="e1" code="VIP" labels={labels} />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/gala"));
    expect(actions.unlockPresaleAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe(
      "Vérification du code…",
    );
  });
  it("code refusé : message et lien pour revenir", async () => {
    actions.unlockPresaleAction.mockResolvedValue({
      ok: false,
      error: "INVALID",
    });
    render(<PresaleAutoUnlock eventId="e1" code="FAUX" labels={labels} />);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Code de prévente invalide",
      ),
    );
    expect(
      screen
        .getByRole("link", { name: "Revenir à la page" })
        .getAttribute("href"),
    ).toBe("/gala");
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("lien « à côté de mes amis » (section 9.9)", () => {
  const share = () =>
    fireEvent.click(screen.getByRole("button", { name: o.friendsShare }));
  it("le partage du téléphone d'abord", async () => {
    const shareFn = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share: shareFn,
      clipboard: { writeText: vi.fn() },
    });
    wrap(
      <ShareFriendLink
        url="https://club.evoly.me/gala?amis=abc"
        eventTitle="Gala"
      />,
    );
    await act(async () => share());
    expect(shareFn).toHaveBeenCalledWith({
      title: "Gala",
      url: "https://club.evoly.me/gala?amis=abc",
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("partage annulé, ou téléphone qui ne sait pas partager : le lien est copié", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share: vi.fn(async () => Promise.reject(new Error("annulé"))),
      clipboard: { writeText },
    });
    const a = wrap(<ShareFriendLink url="https://x/amis" eventTitle="Gala" />);
    await act(async () => share());
    expect(writeText).toHaveBeenCalledWith("https://x/amis");
    expect((await screen.findByRole("status")).textContent).toBe(
      o.friendsCopied,
    );
    a.unmount();
    vi.stubGlobal("navigator", {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });
    wrap(<ShareFriendLink url="https://y/amis" eventTitle="Gala" />);
    await act(async () => share());
    expect(writeText).toHaveBeenLastCalledWith("https://y/amis");
  });
});

describe("bouton collant « Voir les billets »", () => {
  it("navigateur sans observation : toujours visible", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<StickyTicketsButton targetId="billets" label="Voir les billets" />);
    await waitFor(() =>
      expect(
        screen
          .getByRole("link", { name: "Voir les billets" })
          .getAttribute("tabindex"),
      ).toBe("0"),
    );
  });
  it("caché quand le bloc des billets est à l'écran, visible sinon ; observation arrêtée en partant", () => {
    let cb: (entries: Array<{ isIntersecting: boolean }>) => void = () =>
      undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(fn: typeof cb) {
          cb = fn;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      },
    );
    document.body.insertAdjacentHTML("beforeend", '<div id="billets"></div>');
    const r = render(
      <StickyTicketsButton targetId="billets" label="Voir les billets" />,
    );
    act(() => cb([{ isIntersecting: false }]));
    expect(
      screen
        .getByRole("link", { name: "Voir les billets" })
        .getAttribute("tabindex"),
    ).toBe("0");
    act(() => cb([{ isIntersecting: true }]));
    expect(screen.getByText("Voir les billets").getAttribute("tabindex")).toBe(
      "-1",
    );
    r.unmount();
    expect(disconnect).toHaveBeenCalled();
    document.getElementById("billets")?.remove();
  });
});

describe("bouton de copie", () => {
  it("copie la valeur, annonce « copié », puis revient au libellé", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    wrap(<CopyButton value="https://evoly.me/e/7KQ2XM" />);
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: common.copy })),
    );
    expect(writeText).toHaveBeenCalledWith("https://evoly.me/e/7KQ2XM");
    expect(screen.getByRole("button").textContent).toBe(common.copied);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_700)));
    expect(screen.getByRole("button").textContent).toBe(common.copy);
  });
});

describe("formulaires communs", () => {
  it("erreur globale : traduite, sinon message générique ; rien en cas de succès ou d'erreur de champ", () => {
    const known = Object.keys(formErrors).find((k) => k !== "generic")!;
    const a = wrap(<FormError state={{ ok: false, error: known }} />);
    expect(screen.getByRole("alert").textContent).toBe(formErrors[known]);
    a.unmount();
    const b = wrap(<FormError state={{ ok: false, error: "CODE_INCONNU" }} />);
    expect(screen.getByRole("alert").textContent).toBe(formErrors.generic);
    b.unmount();
    const { container } = wrap(
      <>
        <FormError state={{ ok: true, data: null }} />
        <FormError state={{ ok: false, error: "INVALID_INPUT" }} />
        <FormError state={null as never} />
      </>,
    );
    expect(container.textContent).toBe("");
  });

  it("erreur d'un champ : traduite, sinon « invalide » ; aucune sans erreur", () => {
    const v = fr.validation as Record<string, string>;
    const key = Object.keys(v).find((k) => k !== "invalid")!;
    const { result } = renderHook(
      () =>
        useFieldError({
          ok: false,
          error: "INVALID_INPUT",
          fields: { email: `validation.${key}`, nom: "validation.inexistant" },
        } as never),
      { wrapper: ({ children }) => <Fr>{children}</Fr> },
    );
    expect(result.current("email")).toBe(v[key]);
    expect(result.current("nom")).toBe(v.invalid);
    expect(result.current("autre")).toBeNull();
  });

  it("bouton d'envoi : désactivé et libellé d'attente pendant le traitement", () => {
    const a = wrap(
      <SubmitButton pending pendingLabel="Envoi…">
        Envoyer
      </SubmitButton>,
    );
    expect([
      (screen.getByRole("button") as HTMLButtonElement).disabled,
      screen.getByRole("button").textContent,
    ]).toEqual([true, "Envoi…"]);
    a.unmount();
    const b = wrap(<SubmitButton pending>Envoyer</SubmitButton>);
    expect(screen.getByRole("button").textContent).toBe(common.loading);
    b.unmount();
    wrap(<SubmitButton pending={false}>Envoyer</SubmitButton>);
    expect([
      (screen.getByRole("button") as HTMLButtonElement).disabled,
      screen.getByRole("button").textContent,
    ]).toEqual([false, "Envoyer"]);
  });
});
