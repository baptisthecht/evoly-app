import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { AlertForm } from "@/components/public/AlertForm";
import { PresaleForm } from "@/components/public/PresaleForm";
import { ResaleBuy } from "@/components/public/ResaleBuy";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ subscribeAlertAction: vi.fn(), unlockPresaleAction: vi.fn(), reserveResaleAction: vi.fn() }));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/public/CheckoutPanel", () => ({
  CheckoutPanel: ({ reservation, onCancel }: { reservation: { token: string }; onCancel: () => void }) => (
    <div>
      <p>panier {reservation.token}</p>
      <button type="button" onClick={onCancel}>
        revenir
      </button>
    </div>
  ),
}));

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  router.refresh.mockReset();
});

const alertLabels = {
  title: "Prévenez-moi",
  intro: "Un e-mail à l'ouverture",
  email: "Votre e-mail",
  submit: "M'avertir",
  consent: "Seulement pour cette alerte",
  done: "C'est noté",
  error: "Erreur",
  invalid: "Adresse invalide",
  limited: "Trop de tentatives",
};
const submitAlert = async (email = "lea@exemple.be") => {
  fireEvent.change(screen.getByLabelText("Votre e-mail"), { target: { value: email } });
  await act(async () => void fireEvent.submit(screen.getByLabelText("Votre e-mail").closest("form")!));
};

describe("« Prévenez-moi » à l'ouverture des ventes (RG-PRG-04)", () => {
  it("inscription confirmée, adresse transmise", async () => {
    actions.subscribeAlertAction.mockResolvedValue({ ok: true });
    render(<AlertForm eventId="e1" labels={alertLabels} />);
    await submitAlert();
    expect(actions.subscribeAlertAction).toHaveBeenCalledWith("e1", "lea@exemple.be");
    expect((await screen.findByRole("status")).textContent).toBe("C'est noté");
  });

  it("chaque refus a son message : adresse invalide, trop de tentatives, erreur", async () => {
    render(<AlertForm eventId="e1" labels={alertLabels} />);
    for (const [error, text] of [
      ["INVALID_EMAIL", "Adresse invalide"],
      ["RATE_LIMITED", "Trop de tentatives"],
      ["AUTRE", "Erreur"],
    ] as const) {
      actions.subscribeAlertAction.mockResolvedValue({ ok: false, error });
      await submitAlert();
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(text));
    }
  });
});

const presaleLabels = { ask: "J'ai un code de prévente", code: "Code", submit: "Valider", invalid: "Code invalide", limited: "Trop de tentatives" };
describe("code de prévente (RG-PRV-02)", () => {
  it("bon code : la page est rafraîchie pour ouvrir l'achat", async () => {
    actions.unlockPresaleAction.mockResolvedValue({ ok: true });
    render(<PresaleForm eventId="e1" labels={presaleLabels} />);
    fireEvent.click(screen.getByRole("button", { name: "J'ai un code de prévente" }));
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "VIP2026" } });
    await act(async () => void fireEvent.submit(screen.getByLabelText("Code").closest("form")!));
    expect(actions.unlockPresaleAction).toHaveBeenCalledWith("e1", "VIP2026");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("code faux ou trop de tentatives : message dédié, page inchangée", async () => {
    render(<PresaleForm eventId="e1" labels={presaleLabels} />);
    fireEvent.click(screen.getByRole("button", { name: "J'ai un code de prévente" }));
    for (const [error, text] of [
      ["INVALID_CODE", "Code invalide"],
      ["RATE_LIMITED", "Trop de tentatives"],
    ] as const) {
      actions.unlockPresaleAction.mockResolvedValue({ ok: false, error });
      await act(async () => void fireEvent.submit(screen.getByLabelText("Code").closest("form")!));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(text));
    }
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

const r = fr.resale as Record<string, string>;
const c = fr.checkout as Record<string, string>;
const buy = () =>
  render(
    <Fr>
      <ResaleBuy linkCode="lien-1" label="Acheter cette place" organizationName="Club" requirePhone={false} publishableKey={null} />
    </Fr>,
  );
describe("achat d'une place en revente", () => {
  it("annonce réservée : le panier s'ouvre ; annuler revient au bouton", async () => {
    actions.reserveResaleAction.mockResolvedValue({ ok: true, data: { token: "jeton-revente" } });
    buy();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Acheter cette place" })));
    expect(actions.reserveResaleAction).toHaveBeenCalledWith("lien-1");
    expect(await screen.findByText("panier jeton-revente")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "revenir" }));
    expect(screen.getByRole("button", { name: "Acheter cette place" })).toBeTruthy();
  });

  it("pendant la réservation : le bouton annonce le traitement", async () => {
    let finish: (v: unknown) => void = () => undefined;
    actions.reserveResaleAction.mockReturnValue(new Promise((ok) => (finish = ok)));
    buy();
    fireEvent.click(screen.getByRole("button", { name: "Acheter cette place" }));
    expect(((await screen.findByRole("button", { name: c.processing })) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ ok: false, error: "INCONNUE" }));
  });

  it("refus expliqué, ou message générique si l'erreur est inconnue", async () => {
    const known = Object.keys(r).find((k) => k.startsWith("error_") && k !== "error_UNKNOWN")!;
    buy();
    actions.reserveResaleAction.mockResolvedValue({ ok: false, error: known.slice(6) });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Acheter cette place" })));
    expect((await screen.findByRole("alert")).textContent).toBe(r[known]);
    actions.reserveResaleAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Acheter cette place" })));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(c.error_UNKNOWN));
  });
});

type InstallWindow = Window;
const setStandalone = (on: boolean) => Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: on }) });
afterEach(() => {
  (window as InstallWindow).__evolyInstall = null;
  vi.restoreAllMocks();
});
describe("installer l'application", () => {
  it("déjà installée : rien n'est affiché", () => {
    setStandalone(true);
    (window as InstallWindow).__evolyInstall = {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    } as unknown as Window["__evolyInstall"]; // doublure : seules l\'invitation et la réponse servent
    const { container } = render(<InstallAppButton label="Installer l'app" iosHint="Partager, puis Sur l'écran d'accueil" />);
    expect(container.textContent).toBe("");
  });

  it("sur iPhone : la marche à suivre s'ouvre et se referme", () => {
    setStandalone(false);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    render(<InstallAppButton label="Installer l'app" iosHint="Partager, puis Sur l'écran d'accueil" />);
    const b = screen.getByRole("button", { name: "Installer l'app" });
    fireEvent.click(b);
    expect([b.getAttribute("aria-expanded"), !!screen.queryByText("Partager, puis Sur l'écran d'accueil")]).toEqual(["true", true]);
    fireEvent.click(b);
    expect([b.getAttribute("aria-expanded"), !!screen.queryByText("Partager, puis Sur l'écran d'accueil")]).toEqual(["false", false]);
  });

  it("navigateur qui sait installer : son invitation s'ouvre, puis le bouton disparaît", async () => {
    setStandalone(false);
    const prompt = vi.fn(async () => undefined);
    (window as InstallWindow).__evolyInstall = { prompt, userChoice: Promise.resolve({ outcome: "accepted" as const }) } as unknown as Window["__evolyInstall"]; // doublure : seules l\'invitation et la réponse servent
    render(<InstallAppButton label="Installer l'app" iosHint="…" />);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Installer l'app" })));
    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Installer l'app" })).toBeNull();
  });

  it("le bouton apparaît dès que le navigateur rend l'installation possible", () => {
    setStandalone(false);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0) Chrome/130");
    render(<InstallAppButton label="Installer l'app" iosHint="…" />);
    expect(screen.queryByRole("button")).toBeNull();
    (window as InstallWindow).__evolyInstall = {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    } as unknown as Window["__evolyInstall"]; // doublure : seules l\'invitation et la réponse servent
    act(() => void window.dispatchEvent(new Event("evoly:installable")));
    expect(screen.getByRole("button", { name: "Installer l'app" })).toBeTruthy();
  });
});
