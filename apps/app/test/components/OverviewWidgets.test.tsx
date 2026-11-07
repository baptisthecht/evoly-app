import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ViewBeacon } from "@/components/public/ViewBeacon";
import { SubmitOnChange } from "@/components/events/overview/SubmitOnChange";
import {
  RecentOrders,
  TicketsSpark,
  TiersTable,
} from "@/components/events/overview/Widgets";
import { Gauge } from "@/components/ui/Gauge";

const ov = (fr as unknown as Record<string, Record<string, string>>).overview!;
const t = (k: string, v: Record<string, string | number> = {}) =>
  Object.entries(v).reduce(
    (s, [a, b]) => s.replace(`{${a}}`, String(b)),
    ov[k] ?? k,
  );
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
      complimentary: false,
      tickets: 2,
      ticketType: "Normal",
      at: new Date(Date.now() - 3 * 60_000),
    },
    {
      id: "o2",
      reference: "EVO-2",
      buyer: "Tom",
      email: "tom@exemple.be",
      totalMinor: 0,
      currency: "EUR",
      status: "PAID" as const,
      complimentary: true,
      tickets: 1,
      ticketType: null,
      at: new Date(Date.now() - 2 * 86_400_000),
    },
  ],
} as never;
afterEach(() => vi.unstubAllGlobals());

// refonte A3 (maquette « Vue d'ensemble d'un événement ») : l'histogramme des billets, les tarifs en lignes avec leur
// jauge, les dernières commandes en rangées
describe("widgets de la vue d'ensemble", () => {
  it("jauge bornée : jamais plus que pleine", () => {
    render(<Gauge ratio={1.7} />);
    expect(
      (document.querySelector("[aria-hidden] > span") as HTMLElement).style
        .width,
    ).toBe("100%");
  });

  it("histogramme : une barre par jour, la dernière en charbon, décrit pour les lecteurs d'écran", () => {
    render(<TicketsSpark days={(o as { days: never }).days} label="Billets" />);
    expect(screen.getByRole("img", { name: "Billets" })).toBeTruthy();
    const bars = document.querySelectorAll("rect");
    expect(bars).toHaveLength(2);
    expect(bars[1]!.getAttribute("fill")).toBe("var(--ink-strong)");
    expect(bars[0]!.getAttribute("fill")).toBe("var(--control-off)");
  });

  it("tarifs : complet, limité, illimité ; sans droit d'édition, pas de lien", () => {
    const types = [
      {
        id: "a",
        name: "Normal",
        description: null,
        priceMinor: 1000,
        quantity: 10,
        quantitySold: 10,
        salesEndAt: null,
      },
      {
        id: "b",
        name: "Réduit",
        description: "étudiants",
        priceMinor: 500,
        quantity: 50,
        quantitySold: 12,
        salesEndAt: null,
      },
      {
        id: "c",
        name: "Soutien",
        description: null,
        priceMinor: 2500,
        quantity: null,
        quantitySold: 3,
        salesEndAt: null,
      },
    ];
    const draw = (ticketsHref: string | null) => (
      <TiersTable
        t={t}
        locale="fr"
        currency="EUR"
        timezone="Europe/Brussels"
        types={types}
        ticketsHref={ticketsHref}
      />
    );
    const { rerender } = render(draw("/o/club/events/e1/tickets"));
    // le tableau (ordinateur) et les rangées (téléphone) sont tous deux dans la page
    expect(screen.getAllByText(ov.complete!).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(t("soldOf", { sold: 12, total: 50 })).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(t("soldUnlimited", { sold: 3 })).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: ov.manageTickets }).getAttribute("href"),
    ).toBe("/o/club/events/e1/tickets");
    rerender(draw(null));
    expect(screen.queryByRole("link", { name: ov.manageTickets })).toBeNull();
  });

  it("dernières commandes : liens vers les fiches, billets et tarif, montants selon le droit, aucune commande", () => {
    const { rerender } = render(
      <RecentOrders
        o={o}
        t={t}
        locale="fr"
        ordersHref="/o/club/events/e1/orders"
        orderBase="/o/club/orders"
        showAmounts
      />,
    );
    expect(
      screen.getByRole("link", { name: /Léa Martin/ }).getAttribute("href"),
    ).toBe("/o/club/orders/o1");
    expect(
      screen.getByText(t("ticketsOfType", { count: 2, type: "Normal" })),
    ).toBeTruthy();
    expect(screen.getByText(/24,00/)).toBeTruthy();
    expect(screen.getByText(ov.offered!)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: ov.allOrders }).getAttribute("href"),
    ).toBe("/o/club/events/e1/orders");
    rerender(
      <RecentOrders
        o={o}
        t={t}
        locale="fr"
        ordersHref="/o"
        orderBase="/o/club/orders"
        showAmounts={false}
      />,
    );
    expect(screen.queryByText(/24,00/)).toBeNull();
    rerender(
      <RecentOrders
        o={{ ...(o as object), recent: [] } as never}
        t={t}
        locale="fr"
        ordersHref="/o"
        orderBase="/o/club/orders"
        showAmounts={false}
      />,
    );
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
    fireEvent.change(screen.getByRole("combobox", { name: "Statut" }), {
      target: { value: "PAID" },
    });
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
    expect(f).toHaveBeenCalledWith("/api/v/cdef456", {
      method: "POST",
      keepalive: true,
    });
  });
});
