import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  CancelSubscription,
  ChangePaymentMethod,
  ResumeSubscription,
  SettleNow,
} from "@/app/o/[orgSlug]/billing/SubscriptionControls";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  cancelAction: vi.fn(),
  checkoutAction: vi.fn(),
  paymentMethodAction: vi.fn(),
  resumeAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/billing/actions", () => actions);
const b = (fr as unknown as Record<string, Record<string, string>>).billing!;
const errors = (fr as unknown as Record<string, Record<string, string>>)
  .formErrors!;

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});

describe("abonnement Pro payé par Mollie : gestion dans Evoly (docs/MOLLIE.md, lot 6)", () => {
  it("résilier : confirmation avec la date de fin, puis la fenêtre se ferme", async () => {
    actions.cancelAction.mockResolvedValue({ ok: true });
    render(
      <Fr>
        <CancelSubscription orgSlug="club" until="18 décembre 2026" />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: b.cancel }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("18 décembre 2026");
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: b.cancelConfirm }),
        ),
    );
    await waitFor(() =>
      expect(actions.cancelAction).toHaveBeenCalledWith("club", null),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("résiliation refusée : le message reste dans la fenêtre", async () => {
    actions.cancelAction.mockResolvedValue({
      ok: false,
      error: "NOT_SUBSCRIBED",
    });
    render(
      <Fr>
        <CancelSubscription orgSlug="club" until="18 décembre 2026" />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: b.cancel }));
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: b.cancelConfirm }),
        ),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      errors.NOT_SUBSCRIBED,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("reprendre, changer de moyen de paiement, régler : chaque bouton part vers son action", async () => {
    actions.resumeAction.mockResolvedValue({ ok: true });
    actions.paymentMethodAction.mockResolvedValue({
      ok: false,
      error: "MOLLIE_UNAVAILABLE",
    });
    actions.checkoutAction.mockResolvedValue({ ok: true, data: "/" });
    render(
      <Fr>
        <ResumeSubscription orgSlug="club" />
        <ChangePaymentMethod orgSlug="club" />
        <SettleNow orgSlug="club" interval="MONTH" label="Régler maintenant" />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: b.resume })),
    );
    await waitFor(() => expect(actions.resumeAction).toHaveBeenCalled());
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: b.changePaymentMethod }),
        ),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      errors.MOLLIE_UNAVAILABLE,
    );
    expect(screen.getByText(b.changePaymentMethodHelp!)).toBeTruthy();
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Régler maintenant" }),
        ),
    );
    await waitFor(() => expect(actions.checkoutAction).toHaveBeenCalled());
    const data = actions.checkoutAction.mock.calls[0]!.at(-1) as FormData;
    expect(data.get("interval")).toBe("MONTH");
    expect(data.get("mode")).toBe("pay");
    expect(screen.getByText(b.settleHelp!)).toBeTruthy();
  });
});
