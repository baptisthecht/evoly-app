import { formatMoney } from "@evoly/i18n";
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
  CorrectEmail,
  RefundDecision,
  RefundOptions,
  RefundTickets,
  ResendTickets,
  RevertCheckIn,
} from "@/app/o/[orgSlug]/orders/[orderId]/OrderActions";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  correctEmailAction: vi.fn(),
  decideRefundAction: vi.fn(),
  holderAction: vi.fn(),
  refundOptionsAction: vi.fn(),
  refundTicketsAction: vi.fn(),
  resendTicketsAction: vi.fn(),
  revertCheckInAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/orders/actions", () => actions);
const a = fr.ordersAdmin as Record<string, string>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const money = (v: number) => formatMoney(v, "EUR", "fr");
const fill = (msg: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    msg,
  );
const byText = (text: string) =>
  screen.getByText((c) => norm(c) === norm(text));
const lastForm = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.at(-1)!.at(-1) as FormData;
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.restoreAllMocks());
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);
const tickets = [
  { id: "t1", label: "Fosse · Léa", faceValueMinor: 2_500, scanned: false },
  { id: "t2", label: "Fosse · Tom", faceValueMinor: 2_500, scanned: true },
];

describe("remboursement de billets par l'organisateur (US-REF-03, RG-REF-05)", () => {
  it("sans billet remboursable : rien ; billet déjà scanné : signalé", () => {
    const { container, unmount } = wrap(
      <RefundTickets orgSlug="club" orderId="o1" tickets={[]} currency="EUR" />,
    );
    expect(container.textContent).toBe("");
    unmount();
    wrap(
      <RefundTickets
        orgSlug="club"
        orderId="o1"
        tickets={tickets}
        currency="EUR"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: a.refund }));
    expect(screen.getByText((c) => c.includes(a.scanned!))).toBeTruthy();
  });

  it("le bouton annonce le montant des billets cochés", () => {
    wrap(
      <RefundTickets
        orgSlug="club"
        orderId="o1"
        tickets={tickets}
        currency="EUR"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: a.refund }));
    byText(a.refundPick!);
    fireEvent.click(screen.getByLabelText((l) => l.startsWith("Fosse · Léa")));
    fireEvent.click(screen.getByLabelText((l) => l.startsWith("Fosse · Tom")));
    byText(fill(a.refundAmount!, { amount: money(5_000) }));
  });

  it("confirmation annulée : rien n'est remboursé ; confirmée : billets, motif et message envoyés", async () => {
    wrap(
      <RefundTickets
        orgSlug="club"
        orderId="o1"
        tickets={tickets}
        currency="EUR"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: a.refund }));
    fireEvent.click(screen.getByLabelText((l) => l.startsWith("Fosse · Léa")));
    fireEvent.change(screen.getByLabelText(new RegExp(a.messageToBuyer!)), {
      target: { value: "Désolé pour le doublon." },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const form = screen
      .getByRole("button", {
        name: (n) =>
          norm(n) === norm(fill(a.refundAmount!, { amount: money(2_500) })),
      })
      .closest("form")!;
    await act(async () => void fireEvent.submit(form));
    expect(norm(String(confirm.mock.calls[0]![0]))).toBe(
      norm(fill(a.confirmRefund!, { amount: money(2_500) })),
    );
    expect(actions.refundTicketsAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => void fireEvent.submit(form));
    await waitFor(() => expect(actions.refundTicketsAction).toHaveBeenCalled());
    const data = lastForm(actions.refundTicketsAction);
    expect([
      data.getAll("ticketIds"),
      data.get("reason"),
      data.get("message"),
    ]).toEqual([["t1"], "OTHER", "Désolé pour le doublon."]);
  });
});

describe("remboursement d'options non retirées (RG-OPT-07)", () => {
  const options = [
    { id: "o1", name: "Boisson", left: 3, unitPriceMinor: 400 },
    { id: "o2", name: "Vestiaire", left: 0, unitPriceMinor: 200 },
  ];
  it("seulement les options non retirées ; remboursement fermé : message ; aucune à rembourser : rien", () => {
    const one = wrap(
      <RefundOptions
        orgSlug="club"
        orderId="o1"
        options={options}
        currency="EUR"
        closed={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: a.optionsRefund }));
    expect(
      screen.queryByLabelText(fill(a.optionsQuantity!, { name: "Vestiaire" })),
    ).toBeNull();
    expect(
      screen.getByLabelText(fill(a.optionsQuantity!, { name: "Boisson" })),
    ).toBeTruthy();
    one.unmount();
    const two = wrap(
      <RefundOptions
        orgSlug="club"
        orderId="o1"
        options={options}
        currency="EUR"
        closed
      />,
    );
    expect(screen.getByText(a.optionsRefundClosed!)).toBeTruthy();
    two.unmount();
    const { container } = wrap(
      <RefundOptions
        orgSlug="club"
        orderId="o1"
        options={[options[1]!]}
        currency="EUR"
        closed={false}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("jamais au-delà du reste ; montant annoncé ; confirmation annulée : rien ; confirmée : envoyé puis confirmé", async () => {
    wrap(
      <RefundOptions
        orgSlug="club"
        orderId="o1"
        options={options}
        currency="EUR"
        closed={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: a.optionsRefund }));
    const field = screen.getByLabelText(
      fill(a.optionsQuantity!, { name: "Boisson" }),
    ) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "99" } });
    expect(field.value).toBe("3");
    const submit = screen.getByRole("button", {
      name: (n) =>
        norm(n) ===
        norm(fill(a.optionsRefundSubmit!, { amount: money(1_200) })),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => void fireEvent.submit(submit.closest("form")!));
    expect(actions.refundOptionsAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => void fireEvent.submit(submit.closest("form")!));
    await waitFor(() =>
      expect(lastForm(actions.refundOptionsAction).get("q_o1")).toBe("3"),
    );
    expect((await screen.findByRole("status")).textContent).toBe(
      a.optionsRefundDone,
    );
  });
});

describe("demande de remboursement de l'acheteur : décision de l'organisateur", () => {
  it("remboursement en échec : seulement « réessayer »", async () => {
    wrap(
      <RefundDecision
        orgSlug="club"
        orderId="o1"
        refundId="r1"
        mode="failed"
      />,
    );
    expect(screen.queryByRole("button", { name: a.approve })).toBeNull();
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: a.retry }).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(actions.decideRefundAction.mock.calls[0]!.slice(0, 4)).toEqual([
        "club",
        "o1",
        "r1",
        "retry",
      ]),
    );
  });

  it("demande en attente : accepter ou refuser, avec les frais non restitués rappelés", () => {
    wrap(
      <RefundDecision
        orgSlug="club"
        orderId="o1"
        refundId="r1"
        mode="pending"
      />,
    );
    expect(screen.getByRole("button", { name: a.approve })).toBeTruthy();
    expect(screen.getByRole("button", { name: a.reject })).toBeTruthy();
    expect(screen.getByText(a.feesNotReturned!)).toBeTruthy();
  });
});

describe("autres actions sur une commande", () => {
  it("annulation d'une entrée scannée par erreur : motif envoyé ; erreur du motif affichée", async () => {
    actions.revertCheckInAction.mockResolvedValue({
      ok: false,
      error: "INVALID_INPUT",
      fields: { note: "validation.required" },
    });
    wrap(<RevertCheckIn orgSlug="club" orderId="o1" ticketId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: a.revertCheckIn }));
    fireEvent.change(screen.getByLabelText(new RegExp(a.revertReason!)), {
      target: { value: "Scanné par erreur" },
    });
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByLabelText(new RegExp(a.revertReason!)).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(lastForm(actions.revertCheckInAction).get("note")).toBe(
        "Scanné par erreur",
      ),
    );
    const v = fr.validation as Record<string, string>;
    expect(await screen.findByText(v.required ?? v.invalid!)).toBeTruthy();
  });

  it("billets renvoyés et adresse corrigée : confirmations", async () => {
    const one = wrap(<ResendTickets orgSlug="club" orderId="o1" />);
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: a.resend }).closest("form")!,
        ),
    );
    expect((await screen.findByRole("status")).textContent).toBe(a.resent);
    one.unmount();
    wrap(<CorrectEmail orgSlug="club" orderId="o1" email="lea@exemple.be" />);
    fireEvent.click(screen.getByRole("button", { name: a.correctEmail }));
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByLabelText(new RegExp(a.newEmail!)).closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(lastForm(actions.correctEmailAction).get("email")).toBe(
        "lea@exemple.be",
      ),
    );
    expect((await screen.findByRole("status")).textContent).toBe(
      a.emailCorrected,
    );
  });
});
