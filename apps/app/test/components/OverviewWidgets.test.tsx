import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ViewBeacon } from "@/components/public/ViewBeacon";
import { SubmitOnChange } from "@/components/events/overview/SubmitOnChange";
import { Gauge, Kpi, RecentOrders, SalesChart, TiersCard } from "@/components/events/overview/Widgets";

const ov = (fr as unknown as Record<string, Record<string, string>>).overview!;
const t = (k: string, v: Record<string, string | number> = {}) => Object.entries(v).reduce((s, [a, b]) => s.replace(`{${a}}`, String(b)), ov[k] ?? k);
const today = "2026-10-20";
const o = {
  days: [
    { day: "2026-10-19", tickets: 3 },
    { day: today, tickets: 5 },
  ],
  today,
  recent: [
    {
      id: "o1",
      reference: "EVO-1",
      buyer: "Léa Martin",
      email: "lea@exemple.be",
      totalMinor: 2400,
      currency: "EUR",
      status: "PAID" as const,
      at: new Date(Date.now() - 3 * 60_000),
      lines: "2 × Normal",
    },
    {
      id: "o2",
      reference: "EVO-2",
      buyer: "Tom",
      email: "tom@exemple.be",
      totalMinor: 1000,
      currency: "EUR",
      status: "REFUNDED" as const,
      at: new Date(Date.now() - 2 * 86_400_000),
      lines: "1 × Normal",
    },
  ],
} as never;
afterEach(() => vi.unstubAllGlobals());

describe("widgets de la vue d'ensemble", () => {
  it("carte de chiffre et jauge bornée", () => {
    render(
      <Kpi label="Billets vendus" value={12}>
        <Gauge ratio={1.7} />
      </Kpi>,
    );
    expect(screen.getByText("Billets vendus")).toBeTruthy();
    expect((document.querySelector("[aria-hidden] > div") as HTMLElement).style.width).toBe("100%");
  });

  it("graphique : total dans sa description, période active marquée, jours en liens", () => {
    render(<SalesChart o={o} t={t} period="7" base="/o/club/events/e1" locale="fr" />);
    expect(screen.getByRole("img", { name: t("chartLabel", { total: 8 }) })).toBeTruthy();
    const periods = screen.getByRole("navigation", { name: ov.period });
    expect(
      within(periods)
        .getAllByRole("link")
        .map((l) => [l.getAttribute("href"), l.getAttribute("aria-current")]),
    ).toEqual([
      ["/o/club/events/e1?ventes=7", "true"],
      ["/o/club/events/e1?ventes=14", null],
      ["/o/club/events/e1?ventes=all", null],
    ]);
    expect(document.querySelectorAll("rect")).toHaveLength(2);
  });

  it("tarifs : épuisé, limité, illimité, ventes par palier ; sans droit d'édition, pas de lien", () => {
    const types = [
      { id: "a", name: "Normal", priceMinor: 1000, quantity: 10, quantitySold: 10 },
      { id: "b", name: "Réduit", priceMinor: 500, quantity: 50, quantitySold: 12 },
      { id: "c", name: "Soutien", priceMinor: 2500, quantity: null, quantitySold: 3 },
    ];
    const tiers = new Map([
      [
        "b",
        [
          { name: "Prévente", sold: 8 },
          { name: "Normal", sold: 4 },
        ],
      ],
    ]);
    const { rerender } = render(<TiersCard t={t} locale="fr" currency="EUR" types={types} tiersSold={tiers} ticketsHref="/o/club/events/e1/tickets" />);
    expect(screen.getByText(ov.soldOut!)).toBeTruthy();
    expect(screen.getByText(t("soldOf", { sold: 12, total: 50 }))).toBeTruthy();
    expect(screen.getByText(t("soldUnlimited", { sold: 3 }))).toBeTruthy();
    expect(screen.getByTestId("tier-sales").textContent).toBe("Prévente : 8 · Normal : 4");
    expect(screen.getByRole("link", { name: ov.addTier })).toBeTruthy();
    rerender(<TiersCard t={t} locale="fr" currency="EUR" types={types} tiersSold={tiers} ticketsHref={null} />);
    expect(screen.queryByRole("link", { name: ov.addTier })).toBeNull();
  });

  it("dernières commandes : lignes, statuts, montants selon le droit, aucune commande", () => {
    const { rerender } = render(<RecentOrders o={o} t={t} locale="fr" ordersHref="/o/club/events/e1/orders" exportHref="/x.csv" showAmounts />);
    expect(screen.getByRole("link", { name: "Léa Martin" }).getAttribute("href")).toBe("/o/club/events/e1/orders/o1");
    expect(screen.getByText(ov.PAID!, { selector: "span" })).toBeTruthy();
    expect(screen.getByText(ov.REFUNDED!, { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: ov.amount })).toBeTruthy();
    rerender(<RecentOrders o={{ ...(o as object), recent: [] } as never} t={t} locale="fr" ordersHref="/o" exportHref="/x.csv" showAmounts={false} />);
    expect(screen.getByText(ov.noOrders!)).toBeTruthy();
  });

  it("filtre : envoie son formulaire dès qu'on change de valeur", () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={submit as never}>
        <SubmitOnChange name="filter" aria-label="Statut" defaultValue="ALL">
          <option value="ALL">Tous</option>
          <option value="PAID">Payée</option>
        </SubmitOnChange>
      </form>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Statut" }), { target: { value: "PAID" } });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("signal de visite : envoyé une fois ; sans sendBeacon, repli sur fetch", async () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    await act(async () => void render(<ViewBeacon eventId="cabc123" />));
    expect(beacon).toHaveBeenCalledWith("/api/v/cabc123");
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: () => false });
    vi.stubGlobal("fetch", f);
    await act(async () => void render(<ViewBeacon eventId="cdef456" />));
    expect(f).toHaveBeenCalledWith("/api/v/cdef456", { method: "POST", keepalive: true });
  });
});
