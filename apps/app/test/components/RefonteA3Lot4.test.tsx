import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { Fr } from "./intl";

// refonte A3, lot 4 : menus, copie du lien, bandeau, tableau des événements, commandes d'un événement, champ de date

// les vrais textes français pour les composants serveur (tableau des événements)
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: "fr",
      messages: fr,
      namespace: namespace as "dashboard",
    }),
}));
// la jauge du rythme est un composant serveur asynchrone : remplacée ici par son chiffre
vi.mock("@/components/ui/SalesGauge", () => ({
  SalesGauge: ({
    sold,
    capacity,
  }: {
    sold: number;
    capacity: number | null;
  }) => <span data-testid="gauge">{`${sold}/${capacity ?? "∞"}`}</span>,
  DateLeaf: ({ draft }: { draft?: boolean }) => (
    <span data-testid="leaf">{draft ? "brouillon" : "feuille"}</span>
  ),
}));
const ev = vi.hoisted(() => ({ eventCommandAction: vi.fn(async () => null) }));
vi.mock("@/app/o/[orgSlug]/events/actions", () => ev);
const orders = vi.hoisted(() => ({
  resendManyAction: vi.fn(async () => ({ ok: true, data: 2 })),
}));
vi.mock("@/app/o/[orgSlug]/orders/actions", () => orders);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/o/club/orders",
}));

const { EventRowMenu } = await import("@/components/events/EventRowMenu");
const { EventsTable } = await import("@/components/events/EventsTable");
const { OrgMenu } = await import("@/components/shell/OrgMenu");
const { CopyLinkButton } = await import("@/components/shell/CopyLinkButton");
const { HighlightBand, BandKicker, BandTitle, BandText, BandCountdown } =
  await import("@/components/ui/HighlightBand");
const { OrdersTable } = await import("@/app/o/[orgSlug]/orders/OrdersTable");
const { DateTimeField, formatLocal } =
  await import("@/components/ui/DateTimeField");

const all = fr as unknown as Record<string, Record<string, string>>;
const clipboard = { writeText: vi.fn(async () => undefined) };
beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  });
  clipboard.writeText.mockClear();
  ev.eventCommandAction.mockClear();
  orders.resendManyAction.mockClear();
});
afterEach(() => vi.useRealTimers());

const menuLabels = {
  menu: "Actions de Gala",
  open: "Ouvrir",
  preview: "Prévisualiser",
  copy: "Copier le lien",
  copied: "Lien copié",
};

describe("menu « ⋯ » d'une ligne d'événement", () => {
  it("s'ouvre, mène à l'événement et à son aperçu ; Échap ou un clic ailleurs le referment", () => {
    render(
      <EventRowMenu
        base="/o/club"
        eventId="e1"
        title="Gala"
        url="https://club.evoly.me/gala"
        labels={menuLabels}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Actions de Gala" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("link", { name: "Ouvrir" }).getAttribute("href"),
    ).toBe("/o/club/events/e1");
    expect(
      screen.getByRole("link", { name: "Prévisualiser" }).getAttribute("href"),
    ).toBe("/o/club/events/e1/preview");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // un clic dans le menu ne le referme pas
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("link", { name: "Ouvrir" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("copier le lien : l'adresse publique copiée, confirmée, puis le menu se referme", async () => {
    vi.useFakeTimers();
    render(
      <EventRowMenu
        base="/o/club"
        eventId="e1"
        title="Gala"
        url="https://club.evoly.me/gala"
        labels={menuLabels}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Actions de Gala" });
    fireEvent.click(trigger);
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Copier le lien" }),
        ),
    );
    expect(clipboard.writeText).toHaveBeenCalledWith(
      "https://club.evoly.me/gala",
    );
    expect(screen.getByRole("button", { name: "Lien copié" })).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(1300));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("brouillon : rien à copier ; « Dupliquer » seulement avec le droit, et la bonne commande", async () => {
    const { unmount } = render(
      <EventRowMenu
        base="/o/club"
        eventId="e2"
        title="Brouillon"
        labels={menuLabels}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions de Gala" }));
    expect(screen.queryByRole("button", { name: "Copier le lien" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dupliquer" })).toBeNull();
    unmount();
    render(
      <EventRowMenu
        base="/o/club"
        eventId="e2"
        title="Brouillon"
        labels={{ ...menuLabels, duplicate: "Dupliquer" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions de Gala" }));
    await act(
      async () =>
        void fireEvent.submit(
          screen.getByRole("button", { name: "Dupliquer" }).closest("form")!,
        ),
    );
    expect(ev.eventCommandAction).toHaveBeenCalledWith(
      "club",
      "e2",
      "duplicate",
      null,
    );
  });
});

describe("menu de l'organisation", () => {
  it("s'ouvre et se referme (Échap, clic ailleurs, lien suivi)", () => {
    render(
      <OrgMenu trigger={<span>Les Nuits du Quai</span>}>
        <a href="#autre">Autre organisation</a>
        <button type="button">Rester</button>
      </OrgMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Les Nuits du Quai" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.className).toContain("bg-sidebar-raised");
    fireEvent.click(screen.getByRole("button", { name: "Rester" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("link", { name: "Autre organisation" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("copier le lien de l'événement", () => {
  it("copie l'adresse publique, dit « Lien copié » deux secondes", async () => {
    vi.useFakeTimers();
    render(
      <Fr>
        <CopyLinkButton url="https://club.evoly.me/gala" />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: all.nav!.copyLink }),
        ),
    );
    expect(clipboard.writeText).toHaveBeenCalledWith(
      "https://club.evoly.me/gala",
    );
    expect(
      screen.getByRole("button", { name: all.nav!.linkCopied }),
    ).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(2100));
    expect(
      screen.getByRole("button", { name: all.nav!.copyLink }),
    ).toBeTruthy();
  });
});

describe("bandeau mis en avant", () => {
  it("le titre rose, le titre, la phrase et le compte à rebours ; le titre réduit au besoin", () => {
    const { container } = render(
      <HighlightBand aria-label="Prochain événement">
        <div>
          <BandKicker>Prochain événement</BandKicker>
          <BandTitle>Bal folk d’automne</BandTitle>
          <BandTitle small>Petit titre</BandTitle>
          <BandText>samedi 21 novembre</BandText>
        </div>
        <BandCountdown value="14 jours" caption="avant les portes" />
      </HighlightBand>,
    );
    expect(
      screen.getByRole("region", { name: "Prochain événement" }),
    ).toBeTruthy();
    expect(screen.getByText("Prochain événement").className).toContain(
      "text-highlight-ink",
    );
    expect(screen.getByText("Petit titre").className).toContain("text-[16px]");
    expect(screen.getByText("Bal folk d’automne").className).toContain(
      "text-[17px]",
    );
    expect(screen.getByText("14 jours").className).toContain("font-figures");
    expect(container.querySelector("section")!.className).toContain(
      "before:bg-highlight",
    );
  });
});

describe("tableau des événements (composant serveur)", () => {
  const pace = {
    pace: "ahead",
    soldRatio: 0.5,
    elapsedRatio: 0.4,
    soldOutAt: null,
  } as never;
  const now = Date.now();
  const day = 86_400_000;
  const row = (over: Record<string, unknown>) => ({
    id: "e1",
    title: "Gala",
    status: "PUBLISHED" as const,
    currency: "EUR",
    collectedMinor: 123_400,
    startsAt: new Date(now + 10 * day),
    salesStartAt: null,
    timezone: "Europe/Brussels",
    place: "Salle des fêtes, Wépion",
    sold: 50,
    capacity: 100,
    pace,
    url: "https://club.evoly.me/gala",
    ...over,
  });

  it("à venir : la feuille, le titre et le lieu, le jour, la jauge, l'encaissé, le statut et le menu", async () => {
    render(
      <Fr>
        {await EventsTable({
          events: [
            row({}),
            row({
              id: "e2",
              title: "Brouillon",
              status: "DRAFT",
              place: "",
              url: undefined,
            }),
            row({
              id: "e3",
              title: "Bientôt",
              salesStartAt: new Date(now + 5 * day),
            }),
            row({ id: "e4", title: "Gratuit", free: true, capacity: null }),
          ],
          base: "/o/club",
          locale: "fr",
          money: true,
          highlightFirst: true,
          menu: true,
          canDuplicate: true,
        })}
      </Fr>,
    );
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(5); // les titres de colonnes et quatre événements
    expect(
      within(rows[1]!).getByRole("link", { name: /Gala/ }).getAttribute("href"),
    ).toBe("/o/club/events/e1");
    expect(rows[1]!.textContent).toContain("Salle des fêtes, Wépion");
    expect(rows[1]!.textContent).toMatch(/1\s?234,00/);
    expect(rows[1]!.querySelector(".bg-highlight")).not.toBeNull(); // le premier mis en avant
    expect(rows[2]!.textContent).toContain(all.events!.placeTbd);
    expect(rows[2]!.textContent).toContain(all.dashboard!.notOnSale);
    expect(within(rows[3]!).getByTestId("gauge")).toBeTruthy();
    expect(rows[4]!.textContent).toContain(all.dashboard!.free);
    expect(within(rows[1]!).getByRole("button", { name: /Gala/ })).toBeTruthy(); // le menu « ⋯ »
  });

  it("récemment passés : sans titres de colonnes, les ventes en phrase et les entrées, sans encaissé", async () => {
    render(
      <Fr>
        {await EventsTable({
          events: [
            row({
              startsAt: new Date(now - 14 * day),
              status: "ENDED",
              sold: 100,
              capacity: 100,
              entries: 90,
            }),
            row({
              id: "e5",
              title: "Concert",
              startsAt: new Date(now - 28 * day),
              status: "ENDED",
              sold: 40,
              capacity: null,
            }),
          ],
          base: "/o/club",
          locale: "fr",
          money: false,
          past: true,
          head: false,
          withTime: false,
        })}
      </Fr>,
    );
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
    const rows = screen.getAllByRole("row");
    expect(rows[0]!.textContent).toContain("90");
    expect(rows[1]!.textContent).toContain("40");
    expect(screen.queryByTestId("gauge")).toBeNull();
  });
});

describe("commandes dans l'onglet Participants d'un événement", () => {
  const base = {
    email: "lea@exemple.be",
    reference: "EV-4821",
    extra: [],
    tickets: 2,
    total: "36,00 €",
    totalMinor: 3600,
    refunded: "18,00 € remboursés",
    day: "aujourd’hui",
    time: "14:02",
    dateAt: 1,
  };
  const rows = [
    {
      ...base,
      id: "o1",
      kind: "order" as const,
      name: "Léa Martin",
      event: "Bal folk d’automne",
      channel: "En ligne",
      statusLabel: "Payée",
      statusTone: "success" as const,
      href: "/o/club/orders/o1",
    },
    {
      ...base,
      id: "o2",
      kind: "order" as const,
      name: "Tom Dubois",
      event: "Bal folk d’automne",
      channel: "En ligne",
      statusLabel: "Payée",
      statusTone: "success" as const,
      href: "/o/club/orders/o2",
    },
    {
      ...base,
      id: "x1",
      kind: "network" as const,
      name: "Fnac 1234",
      event: "Fosse, rang A",
      channel: "Fnac",
      statusLabel: "Pas encore entré",
      statusTone: "neutral" as const,
      refunded: null,
      href: null,
    },
  ];

  it("sans colonne « Événement » ; un billet de réseau garde son tarif sous le nom ; date et heure sur une ligne", () => {
    render(
      <Fr>
        <OrdersTable
          caption="Commandes"
          orgSlug="club"
          canManage={false}
          showEvent={false}
          rows={rows}
        />
      </Fr>,
    );
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).not.toContain(all.ordersAdmin!.tableEvent);
    const network = screen
      .getAllByRole("row")
      .find((r) => r.textContent!.includes("Fnac 1234"))!;
    expect(network.textContent).toContain("Fosse, rang A");
    expect(screen.getAllByText("aujourd’hui, 14:02").length).toBeGreaterThan(0);
  });

  it("actions groupées : renvoyer les billets des commandes choisies ; « Rembourser » pour une seule commande", async () => {
    render(
      <Fr>
        <OrdersTable caption="Commandes" orgSlug="club" canManage rows={rows} />
      </Fr>,
    );
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!); // Léa (après « tout sélectionner »)
    const bar = screen.getByRole("region", { name: all.table!.selection });
    expect(
      within(bar)
        .getByRole("link", { name: all.ordersAdmin!.refundSelected })
        .getAttribute("href"),
    ).toBe("/o/club/orders/o1#rembourser");
    fireEvent.click(boxes[2]!); // Tom : deux commandes, plus de remboursement groupé
    expect(
      within(bar).queryByRole("link", {
        name: all.ordersAdmin!.refundSelected,
      }),
    ).toBeNull();
    await act(
      async () =>
        void fireEvent.click(
          within(bar).getByRole("button", { name: all.ordersAdmin!.resend }),
        ),
    );
    expect(orders.resendManyAction).toHaveBeenCalledWith("club", ["o1", "o2"]);
    expect(
      await screen.findByText((c) => c.startsWith("Billets renvoyés pour 2")),
    ).toBeTruthy();
  });
});

describe("champ de date et heure", () => {
  it("au repos, la date mise en forme (« 1er » en exposant) ; pendant la saisie, le champ du navigateur", () => {
    const onChange = vi.fn();
    render(
      <DateTimeField
        id="d"
        locale="fr"
        defaultValue="2026-10-01T10:00"
        onChange={onChange}
      />,
    );
    const input = document.getElementById("d") as HTMLInputElement;
    expect(document.querySelector("sup")!.textContent).toBe("er");
    expect(input.className).toContain("text-transparent");
    fireEvent.focus(input);
    expect(input.className).not.toContain("text-transparent");
    fireEvent.change(input, { target: { value: "2026-11-21T19:00" } });
    expect(onChange).toHaveBeenCalled();
    fireEvent.blur(input);
    expect(screen.getByText("21 nov. 2026, 19:00")).toBeTruthy();
  });

  it("vide : le texte gris, ou rien ; jamais le « jj/mm/aaaa » du navigateur", () => {
    const { unmount } = render(
      <DateTimeField id="e" locale="fr" placeholder="Non précisée" />,
    );
    expect(screen.getByText("Non précisée").className).toContain(
      "text-[var(--placeholder)]",
    );
    unmount();
    render(<DateTimeField id="f" locale="fr" value="" onChange={() => {}} />);
    expect(
      (document.getElementById("f") as HTMLInputElement).className,
    ).toContain("text-transparent");
    expect(formatLocal("2026-12-31T23:59", "en")).toBe(
      "Dec 31, 2026, 11:59 PM",
    );
  });
});
