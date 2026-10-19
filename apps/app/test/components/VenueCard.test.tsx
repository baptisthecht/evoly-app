import { formatMoney } from "@evoly/i18n";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { VenueCard } from "@/app/o/[orgSlug]/billing/VenueCard";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  acceptSelfBillingAction: vi.fn(),
  activateVenueAction: vi.fn(),
  venueHallAction: vi.fn(),
  venuePayNowAction: vi.fn(),
  venueThresholdAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/billing/venueActions", () => actions);
const all = fr as unknown as Record<string, Record<string, string>>;
const t = all[Object.keys(all).find((k) => all[k]?.selfBillingAccept && all[k]?.payNow)!]!;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const money = (v: number) => formatMoney(v, "EUR", "fr");
type Venue = NonNullable<Parameters<typeof VenueCard>[0]["venue"]>;
const venue = (over: Partial<Venue> = {}): Venue => ({
  code: "ROTONDE",
  link: "https://evoly.me/lieu/ROTONDE",
  thresholdEnabled: true,
  thresholdMinor: 5_000,
  hall: { name: "La Rotonde", addressLine1: "Rue Haute 1", postalCode: "1000", city: "Bruxelles" },
  balanceMinor: 12_345,
  events: 4,
  organizers: 3,
  months: [{ month: "2026-09", tickets: 120, shareMinor: 4_800 }],
  selfBillingAcceptedAt: null,
  payouts: [
    { id: "v1", amountMinor: 4_800, manual: false, status: "PAID", createdAt: "2026-10-01T08:00:00Z", invoiceNumber: "AF-ROTONDE-0001" },
    { id: "v2", amountMinor: 2_000, manual: true, status: "FAILED", createdAt: "2026-10-05T08:00:00Z", invoiceNumber: null },
  ],
  ...over,
});
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
const draw = (v: Venue | null, manage = true) =>
  render(
    <Fr>
      <VenueCard orgSlug="club" currency="EUR" venue={v} manage={manage} />
    </Fr>,
  );
const submit = async (name: string, index = 0) => act(async () => void fireEvent.submit(screen.getAllByRole("button", { name })[index]!.closest("form")!));

describe("salle partenaire (section 9.32)", () => {
  it("sans salle : présentation, et activation seulement pour qui gère l'organisation", async () => {
    const a = draw(null);
    await submit(t.activate!);
    await waitFor(() => expect(actions.activateVenueAction).toHaveBeenCalled());
    a.unmount();
    draw(null, false);
    expect(screen.queryByRole("button", { name: t.activate })).toBeNull();
  });

  it("salle active : code, lien et organisateurs rattachés", () => {
    const { container } = draw(venue());
    expect(container.textContent).toContain("ROTONDE");
    expect(screen.getByRole("button", { name: t.copyLink })).toBeTruthy();
    expect(container.textContent).toContain("3");
  });

  it("autofacturation : à accepter avant tout reversement, puis sa date affichée", async () => {
    const a = draw(venue());
    expect(a.container.textContent).toContain(t.selfBillingTitle!);
    await submit(t.selfBillingAccept!);
    await waitFor(() => expect(actions.acceptSelfBillingAction).toHaveBeenCalled());
    a.unmount();
    const b = draw(venue({ selfBillingAcceptedAt: "2026-10-02T10:00:00Z" }));
    expect(screen.queryByRole("button", { name: t.selfBillingAccept })).toBeNull();
    expect(norm(b.container.textContent!)).toContain(norm(new Date("2026-10-02T10:00:00Z").toLocaleDateString("fr")));
  });

  it("solde affiché ; reversement immédiat confirmé", async () => {
    const { container } = draw(venue({ selfBillingAcceptedAt: "2026-10-02T10:00:00Z" }));
    expect(norm(container.textContent!)).toContain(norm(money(12_345)));
    await submit(t.payNow!);
    await waitFor(() => expect(actions.venuePayNowAction).toHaveBeenCalled());
    expect(await screen.findByText(t.paid!)).toBeTruthy();
  });

  it("coordonnées de la salle et seuil automatique : préremplis, puis envoyés", async () => {
    draw(venue());
    expect((screen.getByDisplayValue("La Rotonde") as HTMLInputElement).name).toBe("hallName");
    expect((screen.getByDisplayValue("50") as HTMLInputElement).name).toBe("amount"); // 50,00 €
    await submit(t.save!, 0);
    await waitFor(() => expect(actions.venueHallAction).toHaveBeenCalled());
    expect((actions.venueHallAction.mock.calls[0]!.at(-1) as FormData).get("city")).toBe("Bruxelles");
    await submit(t.save!, 1);
    await waitFor(() => expect(actions.venueThresholdAction).toHaveBeenCalled());
    expect((actions.venueThresholdAction.mock.calls[0]!.at(-1) as FormData).get("enabled")).toBe("on");
  });

  it("relevés et reversements : montant payé ou échec signalé, facture disponible quand elle existe", () => {
    const { container } = draw(venue());
    expect(norm(container.textContent!)).toContain(norm(money(4_800)));
    expect(container.textContent).toContain(t.payoutFailed!);
    expect(container.textContent).toContain(t.payoutManual!);
    const invoices = screen.getAllByRole("link", { name: t.invoice });
    expect(invoices.map((a) => a.getAttribute("href"))).toEqual(["/o/club/billing/venue-invoices/v1"]); // pas de facture pour l'échec
  });

  it("sans le droit de gérer : tout est consultable, aucune action possible", () => {
    draw(venue(), false);
    for (const name of [t.selfBillingAccept, t.payNow, t.save]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.getAllByRole("link", { name: t.invoice })).toHaveLength(1);
  });
});
