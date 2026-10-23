import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { RefundRequest } from "@/components/public/RefundRequest";
import { WaitlistJoin } from "@/components/public/WaitlistJoin";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  requestRefundAction: vi.fn(),
  joinWaitlistAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const o = fr.orders as Record<string, string>;
const p = fr.public as Record<string, string>;
const knownError = Object.keys(o).find(
  (k) => k.startsWith("error_") && k !== "error_UNKNOWN",
)!;
beforeEach(() => {
  actions.requestRefundAction.mockReset();
  actions.joinWaitlistAction.mockReset();
  router.refresh.mockReset();
});

const refund = (over: Partial<Parameters<typeof RefundRequest>[0]> = {}) =>
  render(
    <Fr>
      <RefundRequest
        token="jeton"
        tickets={[{ id: "t1", label: "Fosse · Léa" }]}
        automatic={false}
        outOfDeadline={false}
        policyText="Remboursable jusqu'au 1er novembre."
        {...over}
      />
    </Fr>,
  );
// début du message : le rendu du moteur de traduction peut différer légèrement du texte brut (apostrophes, espaces)
const starts = (text: string) => (content: string) =>
  content.startsWith(text.slice(0, 25));
const openRefund = () =>
  fireEvent.click(screen.getByRole("button", { name: o.refundRequest }));

describe("demande de remboursement (US-REF-01)", () => {
  it("fermée : la politique de l'événement et un lien pour demander ; annuler referme", () => {
    refund();
    expect(
      screen.getByText("Remboursable jusqu'au 1er novembre."),
    ).toBeTruthy();
    openRefund();
    expect(screen.getByRole("heading", { name: o.refundRequest })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: o.cancel }));
    expect(screen.queryByRole("heading", { name: o.refundRequest })).toBeNull();
  });

  it("message selon la politique : automatique, hors délai, ou examiné par l'organisateur ; bouton adapté", () => {
    const { unmount } = refund({ automatic: true });
    openRefund();
    expect(screen.getByText(starts(o.refundAutomatic!))).toBeTruthy();
    expect(
      screen.getByRole("button", { name: o.refundSubmitAuto }),
    ).toBeTruthy();
    unmount();
    const b = refund({ outOfDeadline: true });
    openRefund();
    expect(screen.getByText(starts(o.refundOutOfDeadline!))).toBeTruthy();
    b.unmount();
    refund();
    openRefund();
    expect(screen.getByText(starts(o.refundReviewed!))).toBeTruthy();
    expect(screen.getByRole("button", { name: o.refundSubmit })).toBeTruthy();
  });

  it("un seul billet : présélectionné ; plusieurs : rien n'est envoyé tant qu'aucun n'est coché", () => {
    refund({
      tickets: [
        { id: "t1", label: "Fosse · Léa" },
        { id: "t2", label: "Fosse · Tom" },
      ],
    });
    openRefund();
    const submit = screen.getByRole("button", {
      name: o.refundSubmit,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Fosse · Tom"));
    expect(submit.disabled).toBe(false);
  });

  it("envoi : billets et message transmis, page rafraîchie", async () => {
    actions.requestRefundAction.mockResolvedValue({ ok: true });
    refund();
    openRefund();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Je suis malade." },
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: o.refundSubmit }),
        ),
    );
    expect(actions.requestRefundAction).toHaveBeenCalledWith(
      "jeton",
      ["t1"],
      "Je suis malade.",
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("refus : l'explication traduite, ou un message générique si l'erreur est inconnue", async () => {
    refund();
    openRefund();
    actions.requestRefundAction.mockResolvedValue({
      ok: false,
      error: knownError.slice(6),
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: o.refundSubmit }),
        ),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(o[knownError]);
    actions.requestRefundAction.mockResolvedValue({
      ok: false,
      error: "QUELQUE_CHOSE_D_INCONNU",
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: o.refundSubmit }),
        ),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(o.error_UNKNOWN),
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

const waitlist = (max = 4) =>
  render(
    <Fr>
      <WaitlistJoin eventId="e1" ticketTypeId="tt1" name="Fosse" max={max} />
    </Fr>,
  );
const openWaitlist = () =>
  fireEvent.click(screen.getByRole("button", { name: p.waitlistJoin }));
const form = () =>
  screen.getByRole("form", {
    name: p.waitlistJoinFor!.replace("{name}", "Fosse"),
  });

describe("inscription à la liste d'attente (section 9.30)", () => {
  it("nombre de places proposé seulement si plusieurs sont possibles", () => {
    const a = waitlist(4);
    openWaitlist();
    expect(
      [
        ...(screen.getByLabelText(p.waitlistQuantity!) as HTMLSelectElement)
          .options,
      ].map((x) => x.value),
    ).toEqual(["1", "2", "3", "4"]);
    a.unmount();
    waitlist(1);
    openWaitlist();
    expect(screen.queryByLabelText(p.waitlistQuantity!)).toBeNull();
  });

  it("inscription : adresse, places et consentement transmis, puis confirmation", async () => {
    actions.joinWaitlistAction.mockResolvedValue({ ok: true });
    waitlist();
    openWaitlist();
    fireEvent.change(screen.getByLabelText(p.waitlistEmail!), {
      target: { value: "lea@exemple.be" },
    });
    fireEvent.change(screen.getByLabelText(p.waitlistQuantity!), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => void fireEvent.submit(form()));
    expect(actions.joinWaitlistAction).toHaveBeenCalledWith(
      "e1",
      "tt1",
      "lea@exemple.be",
      3,
      true,
    );
    expect((await screen.findByRole("status")).textContent).toBe(
      p.waitlistJoined,
    );
  });

  it("tarif pas complet : message dédié ; autre refus : message générique", async () => {
    waitlist();
    openWaitlist();
    actions.joinWaitlistAction.mockResolvedValue({
      ok: false,
      error: "WAITLIST_NOT_SOLD_OUT",
    });
    await act(async () => void fireEvent.submit(form()));
    expect((await screen.findByRole("alert")).textContent).toBe(
      p.waitlistErrorNotSoldOut,
    );
    actions.joinWaitlistAction.mockResolvedValue({ ok: false, error: "AUTRE" });
    await act(async () => void fireEvent.submit(form()));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(p.waitlistError),
    );
  });

  it("fermée : un simple lien pour s'inscrire", () => {
    waitlist();
    expect(screen.getByRole("button", { name: p.waitlistJoin })).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
