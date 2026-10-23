import { slugify } from "@evoly/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ImportContacts } from "@/app/o/[orgSlug]/marketing/ImportContacts";
import { PreferencesForm } from "@/app/o/[orgSlug]/notifications/preferences/PreferencesForm";
import { OrganizationForm } from "@/app/onboarding/OrganizationForm";
import { Fr } from "./intl";

const onboarding = vi.hoisted(() => ({
  checkSubdomainAction: vi.fn(),
  createOrganizationAction: vi.fn(),
}));
vi.mock("@/app/onboarding/actions", () => onboarding);
const marketing = vi.hoisted(() => ({ importContactsAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/marketing/actions", () => marketing);
const prefs = vi.hoisted(() => ({ savePreferencesAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/notifications/preferences/actions", () => prefs);
const all = fr as unknown as Record<string, Record<string, string>>;
const [ob, tv] = [all.onboarding!, all.validation!];
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
beforeEach(() => {
  for (const f of [
    ...Object.values(onboarding),
    ...Object.values(marketing),
    ...Object.values(prefs),
  ])
    f.mockReset();
  onboarding.checkSubdomainAction.mockResolvedValue({ ok: true });
  onboarding.createOrganizationAction.mockResolvedValue({
    ok: true,
    data: null,
  });
});
afterEach(() => vi.useRealTimers());
const sub = () => document.getElementById("subdomain") as HTMLInputElement;

describe("création d'une organisation à l'inscription (US-ONB-01)", () => {
  it("l'adresse suit le nom tant qu'on ne la modifie pas ; modifiée à la main, elle est nettoyée et ne suit plus", () => {
    render(
      <Fr>
        <OrganizationForm baseDomain="evoly.me" siteUrl="https://evoly.me" />
      </Fr>,
    );
    fireEvent.change(document.getElementById("name")!, {
      target: { value: "Club des Amis d'Été" },
    });
    expect(sub().value).toBe(slugify("Club des Amis d'Été"));
    fireEvent.change(sub(), { target: { value: "Mon_Club!2026" } });
    expect(sub().value).toBe("monclub2026");
    fireEvent.change(document.getElementById("name")!, {
      target: { value: "Autre nom" },
    });
    expect(sub().value).toBe("monclub2026");
  });

  it("disponibilité vérifiée 400 ms après la dernière frappe ; adresse prise signalée ; une réponse en retard n'écrase jamais la plus récente", async () => {
    vi.useFakeTimers();
    const replies: Array<(v: unknown) => void> = [];
    onboarding.checkSubdomainAction.mockImplementation(
      () => new Promise((ok) => replies.push(ok)),
    );
    render(
      <Fr>
        <OrganizationForm baseDomain="evoly.me" siteUrl="https://evoly.me" />
      </Fr>,
    );
    fireEvent.change(sub(), { target: { value: "club" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(399)));
    expect(onboarding.checkSubdomainAction).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2)));
    fireEvent.change(sub(), { target: { value: "clubdesamis" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(401)));
    expect(onboarding.checkSubdomainAction.mock.calls.map((c) => c[0])).toEqual(
      ["club", "clubdesamis"],
    );
    await act(async () => replies[1]!({ ok: false, reason: "TAKEN" }));
    await act(async () => replies[0]!({ ok: true })); // réponse en retard pour « club »
    expect(
      screen.getByText((c) => norm(c) === norm(tv.SUBDOMAIN_TAKEN!)),
    ).toBeTruthy();
    expect(screen.queryByText(ob.addressAvailable!)).toBeNull();
  });

  it("envoi : nom, adresse, pays par défaut, type et acceptation des conditions", async () => {
    render(
      <Fr>
        <OrganizationForm baseDomain="evoly.me" siteUrl="https://evoly.me" />
      </Fr>,
    );
    fireEvent.change(document.getElementById("name")!, {
      target: { value: "Club" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    await act(
      async () =>
        void fireEvent.submit(
          screen
            .getByRole("button", { name: ob.createOrganization })
            .closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(onboarding.createOrganizationAction).toHaveBeenCalled(),
    );
    const data = onboarding.createOrganizationAction.mock.calls[0]!.at(
      -1,
    ) as FormData;
    expect([
      data.get("name"),
      data.get("subdomain"),
      data.get("country"),
      !!data.get("type"),
      data.get("terms"),
    ]).toEqual(["Club", "club", "BE", true, "on"]);
  });
});

// le navigateur simulé ne connaît pas File.text(), que tous les navigateurs proposent
const csv = (content: string) =>
  Object.assign(new File([content], "contacts.csv", { type: "text/csv" }), {
    text: async () => content,
  });
const importLabels = {
  title: "Importer des contacts",
  intro: "Un fichier CSV",
  file: "Fichier CSV",
  consent: "Ces personnes ont consenti à recevoir nos e-mails",
  submit: "Importer",
  doneTemplate:
    "{created} créés, {updated} mis à jour, {unsubscribed} désinscrits, {invalid} invalides",
  errors: { TOO_MANY_ROWS: "Trop de lignes" },
  fallbackError: "Import impossible",
};
describe("import de contacts (RGPD : consentement certifié)", () => {
  it("impossible sans fichier et sans la confirmation du consentement", () => {
    const { container } = render(
      <ImportContacts orgSlug="club" labels={importLabels} />,
    );
    const button = screen.getByRole("button", {
      name: "Importer",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [csv("email\nlea@exemple.be")] },
    });
    expect(button.disabled).toBe(true); // le consentement manque encore
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(false);
  });

  it("fichier envoyé avec le consentement, bilan affiché ; refus expliqué", async () => {
    const { container } = render(
      <ImportContacts orgSlug="club" labels={importLabels} />,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [csv("email\nlea@exemple.be")] },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    marketing.importContactsAction.mockResolvedValue({
      ok: true,
      data: { created: 3, updated: 1, unsubscribed: 0, invalid: 2 },
    });
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: "Importer" }).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(marketing.importContactsAction).toHaveBeenCalledWith(
        "club",
        "email\nlea@exemple.be",
        true,
      ),
    );
    expect((await screen.findByRole("status")).textContent).toBe(
      "3 créés, 1 mis à jour, 0 désinscrits, 2 invalides",
    );
    marketing.importContactsAction.mockResolvedValue({
      ok: false,
      error: "TOO_MANY_ROWS",
    });
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: "Importer" }).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Trop de lignes"),
    );
  });
});

const prefLabels = {
  type: "Type",
  inApp: "Dans l'application",
  email: "Par e-mail",
  save: "Enregistrer",
  saved: "Enregistré",
};
const rows = [
  { type: "ORDER_PAID", label: "Commande payée", inApp: true, email: true },
  {
    type: "STRIPE_ACTION_REQUIRED",
    label: "Action Stripe",
    inApp: true,
    email: null,
  },
];
describe("préférences de notification", () => {
  it("notifications coupées envoyées par type ; un type sans e-mail possible n'en propose pas", async () => {
    prefs.savePreferencesAction.mockResolvedValue({ ok: true });
    render(<PreferencesForm orgSlug="club" rows={rows} labels={prefLabels} />);
    expect(
      screen.queryByRole("checkbox", { name: "Action Stripe : Par e-mail" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Commande payée : Dans l'application",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Commande payée : Par e-mail" }),
    );
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: "Enregistrer" }).closest("form")!,
        ),
    );
    expect(prefs.savePreferencesAction).toHaveBeenCalledWith(
      "club",
      ["ORDER_PAID"],
      ["ORDER_PAID"],
    );
    expect((await screen.findByRole("status")).textContent).toBe("Enregistré");
  });

  it("la confirmation disparaît dès qu'on modifie un réglage", async () => {
    prefs.savePreferencesAction.mockResolvedValue({ ok: true });
    render(<PreferencesForm orgSlug="club" rows={rows} labels={prefLabels} />);
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: "Enregistrer" }).closest("form")!,
        ),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Action Stripe : Dans l'application",
      }),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
