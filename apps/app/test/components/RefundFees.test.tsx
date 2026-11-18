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
import { RefundDefault } from "@/app/o/[orgSlug]/settings/payments/RefundDefault";
import {
  SettingsForm,
  type SettingsValues,
} from "@/app/o/[orgSlug]/events/[eventId]/settings/SettingsForm";
import type { ReservationView } from "@/app/site/[sub]/[eventSlug]/actions";
import { CheckoutPanel } from "@/components/public/CheckoutPanel";
import { RefundRequest } from "@/components/public/RefundRequest";
import { RefundRuleText } from "@/components/public/RefundRuleText";
import { Fr } from "./intl";

// remboursement à coût neutre (RG-REF-09 à RG-REF-11) : réglages, règle affichée avant l'achat, montant exact demandé
const actions = vi.hoisted(() => ({
  requestRefundAction: vi.fn(),
  submitBuyerAction: vi.fn(),
  cancelReservationAction: vi.fn(),
  changeSeatsAction: vi.fn(),
  saveEventSettingsAction: vi.fn(),
  refundDefaultAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
vi.mock("@/app/o/[orgSlug]/events/actions", () => actions);
vi.mock("@/app/o/[orgSlug]/settings/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/public/SeatMapPicker", () => ({
  SeatMapPicker: () => null,
}));

const o = fr.orders as Record<string, string>;
const p = fr.public as Record<string, string>;
const es = fr.eventSettings as Record<string, string>;
const st = fr.settings as Record<string, string>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const money = (v: number) => formatMoney(v, "EUR", "fr");
const fill = (msg: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), msg);
// le texte peut être réparti entre plusieurs éléments : comparé sur l'élément entier (le plus profond suffit)
const has = (text: string) =>
  screen.getAllByText(
    (_, el) => !!el && norm(el.textContent ?? "") === norm(text),
  ).length > 0;
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.useRealTimers());

describe("demande de remboursement : le montant exact rendu (RG-REF-11)", () => {
  const tickets = [
    { id: "t1", label: "Fosse · A1", faceValueMinor: 2_000 },
    { id: "t2", label: "Fosse · A2", faceValueMinor: 2_000 },
  ];
  const draw = (over: Partial<Parameters<typeof RefundRequest>[0]> = {}) => {
    render(
      <Fr>
        <RefundRequest
          token="jeton"
          tickets={tickets}
          automatic
          outOfDeadline={false}
          policyText="Remboursable."
          currency="EUR"
          {...over}
        />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: o.refundRequest }));
  };
  const tick = (label: string) =>
    fireEvent.click(screen.getByRole("checkbox", { name: label }));

  it("intégral : le prix payé des billets cochés, sans frais retenus", () => {
    draw();
    expect(
      screen.queryByText((c) => c.startsWith("Montant remboursé")),
    ).toBeNull();
    tick("Fosse · A1");
    expect(has(fill(o.refundAmount!, { amount: money(2_000) }))).toBeTruthy();
    expect(
      screen.queryByText((c) => c.startsWith("Frais de paiement")),
    ).toBeNull();
  });

  it("moins les frais : frais retenus au prorata ; tous les billets : les options non retirées s'ajoutent", () => {
    draw({
      optionsWithLastTicketsMinor: 600,
      fees: {
        mode: "MINUS_FEES",
        orderTotalMinor: 4_600,
        applicationFeeMinor: 184,
        paymentFeeMinor: 92,
        alreadyWithheldMinor: 0,
      },
    });
    tick("Fosse · A1");
    // 276 € de frais × 2 000 / 4 600 = 120
    expect(has(fill(o.refundAmount!, { amount: money(1_880) }))).toBeTruthy();
    expect(
      has(fill(o.refundFeesWithheld!, { amount: money(120) })),
    ).toBeTruthy();
    tick("Fosse · A2");
    expect(
      has(fill(o.refundAmount!, { amount: money(4_600 - 276) })),
    ).toBeTruthy();
    expect(
      has(fill(o.refundFeesWithheld!, { amount: money(276) })),
    ).toBeTruthy();
  });
});

describe("règle de remboursement avant l'achat (page de l'événement, tunnel d'achat)", () => {
  const rule = (
    over: Partial<Parameters<typeof RefundRuleText>[0]["rule"]> = {},
  ) => ({
    policy: "ALWAYS" as const,
    deadlineAt: null,
    timezone: "Europe/Brussels",
    feeMode: "FULL" as const,
    ...over,
  });
  it("politique puis frais ; date limite en clair ; non remboursable : sans ligne de frais", () => {
    const { unmount } = render(
      <Fr>
        <RefundRuleText rule={rule({ feeMode: "MINUS_FEES" })} />
      </Fr>,
    );
    expect(
      has(`${p.refundLabel} ${p.refundRule_ALWAYS} ${p.refundFee_MINUS_FEES}`),
    ).toBeTruthy();
    unmount();
    const second = render(
      <Fr>
        <RefundRuleText
          rule={rule({
            policy: "UNTIL_DEADLINE",
            deadlineAt: "2026-12-12T10:00:00.000Z",
          })}
        />
      </Fr>,
    );
    expect(
      has(
        `${p.refundLabel} ${fill(p.refundRule_UNTIL_DEADLINE!, { date: "12 décembre 2026" })} ${p.refundFee_FULL}`,
      ),
    ).toBeTruthy();
    second.unmount();
    render(
      <Fr>
        <RefundRuleText
          rule={rule({ policy: "NON_REFUNDABLE", feeMode: "MINUS_FEES" })}
        />
      </Fr>,
    );
    expect(has(`${p.refundLabel} ${p.refundRule_NON_REFUNDABLE}`)).toBeTruthy();
  });

  it("tunnel d'achat : rappelée avant de payer, jamais pour une commande gratuite", () => {
    const view = (over: Partial<ReservationView>): ReservationView => ({
      options: [],
      token: "jeton",
      reference: "EVO-1",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      currency: "EUR",
      totalMinor: 2_000,
      isFree: false,
      discountMinor: 0,
      promoCode: null,
      lines: [
        {
          orderItemId: "i1",
          ticketTypeId: "t1",
          name: "Fosse",
          tierName: null,
          quantity: 1,
          unitPriceMinor: 2_000,
          nominative: false,
        },
      ],
      mollie: true, // paiement sur la page de Mollie
      questions: { order: [], perLine: {} },
      refund: rule({ feeMode: "MINUS_FEES" }),
      ...over,
    });
    const panel = (r: ReservationView) =>
      render(
        <Fr>
          <CheckoutPanel
            reservation={r}
            organizationName="Club"
            requirePhone={false}
            onCancel={vi.fn()}
          />
        </Fr>,
      );
    const { unmount } = panel(view({}));
    expect(
      screen.getByText((c) => c.includes(p.refundFee_MINUS_FEES!)),
    ).toBeTruthy();
    unmount();
    panel(view({ isFree: true, totalMinor: 0 }));
    expect(
      screen.queryByText((c) => c.includes(p.refundFee_MINUS_FEES!)),
    ).toBeNull();
  });
});

describe("réglages : par événement, et par défaut pour l'organisation (RG-REF-09)", () => {
  const values = (over: Partial<SettingsValues> = {}): SettingsValues => ({
    title: "Gala",
    summary: "",
    startsAtLocal: "2026-12-20T20:00",
    endsAtLocal: "",
    timezone: "Europe/Brussels",
    locationType: "PHYSICAL",
    locationName: "Salle",
    addressLine1: "Rue Haute 1",
    postalCode: "1000",
    city: "Bruxelles",
    country: "BE",
    onlineUrl: "",
    capacity: "200",
    maxTicketsPerOrder: 10,
    maxTicketsPerBuyer: null,
    version: "v1",
    visibility: "PUBLIC",
    refundPolicy: "ALWAYS",
    refundDeadlineLocal: "",
    refundFeeMode: "FULL",
    salesStartLocal: "",
    salesEndLocal: "",
    resaleEnabled: true,
    resaleCutoffHours: 2,
    resaleWaitlistFirst: true,
    resaleWaitlistMinutes: 45,
    showResaleSection: true,
    ...over,
  });
  const drawSettings = (v: SettingsValues) =>
    render(
      <Fr>
        <SettingsForm orgSlug="club" eventId="e1" values={v} readOnly={false} />
      </Fr>,
    );

  it("événement remboursable : le choix est enregistré, avec son explication", async () => {
    vi.useFakeTimers();
    actions.saveEventSettingsAction.mockResolvedValue({
      ok: true,
      data: { version: "v2", concurrent: false },
    });
    drawSettings(values());
    const select = screen.getByLabelText(es.refundFees!) as HTMLSelectElement;
    expect(select.value).toBe("FULL");
    fireEvent.change(select, { target: { value: "MINUS_FEES" } });
    expect(
      screen.getByText((c) =>
        c.startsWith(es.refundFeesHint_MINUS_FEES!.slice(0, 20)),
      ),
    ).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_050)));
    const form = actions.saveEventSettingsAction.mock.calls
      .at(-1)!
      .at(-1) as FormData;
    expect(form.get("refundFeeMode")).toBe("MINUS_FEES");
  });

  it("non remboursable : pas de choix affiché, la valeur est gardée", () => {
    drawSettings(
      values({ refundPolicy: "NON_REFUNDABLE", refundFeeMode: "MINUS_FEES" }),
    );
    expect(screen.queryByLabelText(es.refundFees!)).toBeNull();
    expect(
      (
        document.querySelector(
          'input[name="refundFeeMode"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("MINUS_FEES");
  });

  it("Paramètres, Paiements : la valeur par défaut est envoyée ; en lecture seule, pas de bouton", async () => {
    const { unmount } = render(
      <Fr>
        <RefundDefault orgSlug="club" value="FULL" readOnly={false} />
      </Fr>,
    );
    fireEvent.change(screen.getByLabelText(st.refundDefaultTitle!), {
      target: { value: "MINUS_FEES" },
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: st.refundDefaultSave }),
        ),
    );
    await waitFor(() => expect(actions.refundDefaultAction).toHaveBeenCalled());
    const call = actions.refundDefaultAction.mock.calls[0]!;
    expect(call[0]).toBe("club");
    expect((call.at(-1) as FormData).get("refundFeeMode")).toBe("MINUS_FEES");
    expect(await screen.findByText(st.refundDefaultSaved!)).toBeTruthy();
    unmount();
    render(
      <Fr>
        <RefundDefault orgSlug="club" value="MINUS_FEES" readOnly />
      </Fr>,
    );
    expect(
      screen.queryByRole("button", { name: st.refundDefaultSave }),
    ).toBeNull();
  });
});
