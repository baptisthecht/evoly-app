import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { DeleteOrganization } from "@/app/o/[orgSlug]/settings/SettingsClient";
import {
  PayButton,
  PaymentFields,
  StripePayment,
} from "@/components/public/StripePayment";
import { Fr } from "./intl";

// paiement Stripe (Payment Element, RG-PAY-02 et 03) et suppression de l'organisation (RG-ORG-06)
const stripeJs = vi.hoisted(() => ({
  loadStripe: vi.fn(async () => ({ id: "stripe-simulé" })),
}));
vi.mock("@stripe/stripe-js", () => stripeJs);
const hooks = vi.hoisted(() => ({
  stripe: null as unknown,
  elements: null as unknown,
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({
    children,
    options,
  }: {
    children: ReactNode;
    options: unknown;
  }) => (
    <div data-testid="elements" data-options={JSON.stringify(options)}>
      {children}
    </div>
  ),
  PaymentElement: () => <div data-testid="moyens-de-paiement" />,
  useStripe: () => hooks.stripe,
  useElements: () => hooks.elements,
}));
const settings = vi.hoisted(() => ({
  deleteOrganizationAction: vi.fn(),
  saveSettingsAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/settings/actions", () => settings);
const o = (fr as unknown as Record<string, Record<string, string>>)
  .orgSettings!;
beforeEach(() => {
  hooks.stripe = null;
  hooks.elements = null;
  settings.deleteOrganizationAction.mockReset();
});

describe("paiement Stripe", () => {
  it("montant, devise en minuscules et langue transmis ; Stripe chargé une seule fois par compte d'organisateur", () => {
    const pay = (amountMinor: number) => (
      <StripePayment
        publishableKey="pk_test_1"
        stripeAccountId="acct_club"
        amountMinor={amountMinor}
        currency="EUR"
        locale="fr-BE"
      >
        <PaymentFields />
      </StripePayment>
    );
    const { rerender } = render(pay(2500));
    const options = JSON.parse(
      screen.getByTestId("elements").dataset.options!,
    ) as Record<string, unknown>;
    expect(options).toMatchObject({
      mode: "payment",
      amount: 2500,
      currency: "eur",
      locale: "fr",
    });
    expect(screen.getByTestId("moyens-de-paiement")).toBeTruthy();
    rerender(pay(3000));
    expect(stripeJs.loadStripe).toHaveBeenCalledTimes(1);
    expect(stripeJs.loadStripe).toHaveBeenCalledWith("pk_test_1", {
      stripeAccount: "acct_club",
    });
  });

  it("bouton : inactif tant que Stripe n'est pas prêt ou pendant le paiement ; prêt : paie avec Stripe et le formulaire", () => {
    const onPay = vi.fn();
    const button = (busy: boolean) => (
      <PayButton label="Payer 25 €" busy={busy} onPay={onPay} />
    );
    const { rerender } = render(button(false));
    expect(
      (screen.getByRole("button", { name: "Payer 25 €" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    hooks.stripe = { id: "stripe" };
    hooks.elements = { id: "elements" };
    rerender(button(false));
    fireEvent.click(screen.getByRole("button", { name: "Payer 25 €" }));
    expect(onPay).toHaveBeenCalledWith(hooks.stripe, hooks.elements);
    rerender(button(true));
    const busy = screen.getByRole("button", {
      name: "Payer 25 €",
    }) as HTMLButtonElement;
    expect([busy.disabled, busy.getAttribute("aria-busy")]).toEqual([
      true,
      "true",
    ]);
  });
});

describe("suppression de l'organisation", () => {
  it("blocages : affichés à la place du formulaire", () => {
    render(
      <Fr>
        <DeleteOrganization
          orgSlug="club"
          name="Club de Mouscron"
          blockers={Object.keys(o)
            .filter((k) => k.startsWith("blocker_"))
            .slice(0, 2)
            .map((k) => k.slice(8))}
        />
      </Fr>,
    );
    expect(screen.queryByRole("button", { name: o.deleteSubmit })).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("double confirmation : champ affiché après « je comprends », nom mal recopié signalé, bon nom envoyé", async () => {
    settings.deleteOrganizationAction.mockResolvedValue({ ok: true });
    render(
      <Fr>
        <DeleteOrganization
          orgSlug="club"
          name="Club de Mouscron"
          blockers={[]}
        />
      </Fr>,
    );
    expect(document.getElementById("delete-confirm")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(document.getElementById("delete-confirm")!, {
      target: { value: "Club" },
    });
    expect(screen.getByText(o.deleteMismatch!)).toBeTruthy();
    fireEvent.change(document.getElementById("delete-confirm")!, {
      target: { value: " Club de Mouscron " },
    });
    expect(screen.queryByText(o.deleteMismatch!)).toBeNull();
    fireEvent.submit(
      document.getElementById("delete-confirm")!.closest("form")!,
    );
    await waitFor(() =>
      expect(settings.deleteOrganizationAction).toHaveBeenCalled(),
    );
    const [org, , form] = settings.deleteOrganizationAction.mock.calls[0] as [
      string,
      unknown,
      FormData,
    ];
    expect([org, form.get("understood"), form.get("confirmation")]).toEqual([
      "club",
      "on",
      " Club de Mouscron ",
    ]);
  });
});
