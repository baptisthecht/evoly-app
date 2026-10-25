import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EventTab } from "@/components/shell/eventTabs";
import { TabBar } from "@/components/shell/TabBar";
import {
  activeTab,
  eventTabBar,
  type TabBarSection,
  type TabBarTab,
} from "@/components/shell/tabBar";
import { Fr } from "./intl";

// barre d'onglets du téléphone (maquette validée : capsule flottante, variante D)
// jsdom n'a pas PointerEvent : celui du navigateur hérite de MouseEvent (position, bouton)
if (!("PointerEvent" in window))
  Object.defineProperty(window, "PointerEvent", {
    value: class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "touch";
      }
    },
  });
const nav = vi.hoisted(() => ({ path: "/o/club" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
const tabs: TabBarTab[] = [
  { key: "home", label: "Accueil", href: "/o/club", icon: "home", exact: true },
  {
    key: "events",
    label: "Événements",
    href: "/o/club/events",
    icon: "calendar",
  },
  {
    key: "orders",
    label: "Commandes",
    href: "/o/club/orders",
    icon: "receipt",
  },
];
const more: TabBarSection[] = [
  {
    label: "Organisation",
    items: [
      { label: "Paramètres", href: "/o/club/settings", icon: "gear" },
      {
        label: "Votre marque",
        href: "/o/club/brand",
        icon: "palette",
        pro: "Pro",
      },
    ],
  },
];
const view = (event?: { name: string; leaveHref: string }) => (
  <Fr>
    <TabBar
      label="Navigation de l’organisation"
      tabs={tabs}
      more={more}
      event={event}
    />
  </Fr>
);

describe("barre d'onglets du téléphone", () => {
  it("onglet actif déployé avec son libellé ; les autres, des liens à icône nommés", () => {
    nav.path = "/o/club/events/e1/tickets";
    render(view());
    const bar = screen.getByRole("navigation", {
      name: "Navigation de l’organisation",
    });
    const current = within(bar).getByRole("link", { current: "page" });
    expect([current.textContent, current.getAttribute("href")]).toEqual([
      "Événements",
      "/o/club/events",
    ]);
    // arrondi complet, même dans le thème Pro (qui redessine les autres pilules à l'arrondi de ses boutons)
    expect([
      current.hasAttribute("data-pill"),
      current.className.includes("rounded-full"),
    ]).toEqual([true, true]);
    expect(within(bar).getByRole("link", { name: "Accueil" }).textContent).toBe(
      "",
    );
    expect(
      within(bar)
        .getByRole("button", { name: "Plus" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("« Plus » ouvre la feuille ; Échap, le fond ou un changement de page la ferment", async () => {
    nav.path = "/o/club";
    const r = render(view());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Plus" }));
    const sheet = screen.getByRole("dialog", { name: "Autres pages" });
    expect(
      within(sheet)
        .getByRole("link", { name: "Paramètres" })
        .getAttribute("href"),
    ).toBe("/o/club/settings");
    expect(within(sheet).getByText("Pro")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Plus" }));
    await user.click(screen.getAllByRole("button", { name: "Fermer" })[0]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Plus" }));
    nav.path = "/o/club/settings";
    r.rerender(view());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("page de « Plus » : « Plus » déployé, et la page marquée dans la feuille", async () => {
    nav.path = "/o/club/settings";
    render(view());
    const bar = screen.getByRole("navigation", {
      name: "Navigation de l’organisation",
    });
    expect(within(bar).queryByRole("link", { current: "page" })).toBeNull();
    const plus = within(bar).getByRole("button", { name: "Plus" });
    expect(plus.textContent).toBe("Plus");
    await userEvent.setup().click(plus);
    expect(
      within(screen.getByRole("dialog"))
        .getByRole("link", { name: "Paramètres" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("dans un événement : son étiquette ramène à la liste des événements", () => {
    nav.path = "/o/club/events/e1";
    render(view({ name: "Gala du 17 avril", leaveHref: "/o/club/events" }));
    expect(
      screen
        .getByRole("link", { name: "Quitter l’événement Gala du 17 avril" })
        .getAttribute("href"),
    ).toBe("/o/club/events");
  });
});

describe("feuille « Plus » : tuiles et poignée", () => {
  it("tirée lentement : elle suit le doigt, revient sous le seuil, se ferme au-delà ; un geste rapide la ferme aussi", async () => {
    nav.path = "/o/club";
    render(view());
    const user = userEvent.setup();
    const clock = vi.spyOn(performance, "now");
    const pull = (from: number, to: number, ms: number) => {
      const grab = screen.getByRole("dialog").querySelector("[data-grab]")!;
      clock.mockReturnValue(1000);
      fireEvent.pointerDown(grab, { clientY: from, pointerId: 1, button: 0 });
      clock.mockReturnValue(1000 + ms);
      fireEvent.pointerMove(grab, { clientY: to, pointerId: 1 });
      return () => fireEvent.pointerUp(grab, { clientY: to, pointerId: 1 });
    };
    await user.click(screen.getByRole("button", { name: "Plus" }));
    const sheet = screen.getByRole("dialog", { name: "Autres pages" });
    let release = pull(100, 140, 400);
    expect(sheet.style.transform).toBe("translateY(40px)"); // la feuille suit le doigt
    release();
    expect(sheet.style.transform).toBe("translateY(0px)"); // petit tirage lent : elle revient
    release = pull(100, 300, 400);
    release();
    expect(screen.queryByRole("dialog")).toBeNull(); // au-delà du seuil : fermée
    await user.click(screen.getByRole("button", { name: "Plus" }));
    release = pull(100, 160, 60);
    release();
    expect(screen.queryByRole("dialog")).toBeNull(); // geste rapide : fermée
    clock.mockRestore();
  });

  it("des tuiles comme des applications : icône, nom, badge Pro ; la page affichée est marquée", async () => {
    nav.path = "/o/club/brand";
    render(view());
    await userEvent.setup().click(screen.getByRole("button", { name: "Plus" }));
    const sheet = screen.getByRole("dialog", { name: "Autres pages" });
    const tiles = within(sheet).getAllByRole("listitem");
    expect(tiles.map((t) => t.textContent)).toEqual([
      "Paramètres",
      "ProVotre marque",
    ]);
    const brand = within(sheet).getByRole("link", { name: /Votre marque/ });
    expect([
      brand.getAttribute("aria-current"),
      brand.querySelector("svg") !== null,
    ]).toEqual(["page", true]);
  });
});

describe("modèle de la barre", () => {
  it("onglet actif : adresse exacte pour l'accueil, sinon l'adresse et ses pages", () => {
    expect([
      activeTab(tabs, "/o/club"),
      activeTab(tabs, "/o/club/"),
      activeTab(tabs, "/o/club/orders/o1"),
      activeTab(tabs, "/o/club/settings"),
    ]).toEqual(["home", "home", "orders", null]);
  });

  it("événement : Aperçu, Billetterie, Participants, Jour J en onglets ; le reste dans « Plus »", () => {
    const base = "/o/club/events/e1";
    const item = (label: string, path: string) => ({
      label,
      href: `${base}/${path}`,
    });
    const event: EventTab[] = [
      { key: "overview", label: "Vue d’ensemble", href: base, items: [] },
      {
        key: "ticketing",
        label: "Billetterie",
        href: `${base}/tickets`,
        items: [item("Tarifs", "tickets"), item("Plan de salle", "seating")],
      },
      {
        key: "attendees",
        label: "Participants",
        href: `${base}/orders`,
        items: [item("Commandes", "orders"), item("Revente", "resale")],
      },
      {
        key: "sales",
        label: "Vente et promotion",
        href: `${base}/promo`,
        items: [
          item("Codes promo", "promo"),
          item("Réseaux de vente", "distribution"),
        ],
      },
      {
        key: "dayOf",
        label: "Jour J",
        href: `${base}/entries`,
        items: [item("Entrées", "entries")],
      },
      {
        key: "settings",
        label: "Réglages",
        href: `${base}/settings`,
        items: [],
      },
    ];
    const r = eventTabBar(event, { overview: "Aperçu" });
    expect(r.tabs.map((t) => [t.key, t.label, t.href, t.icon])).toEqual([
      ["overview", "Aperçu", base, "grid"],
      ["ticketing", "Billetterie", `${base}/tickets`, "ticket"],
      ["attendees", "Participants", `${base}/orders`, "users"],
      ["dayOf", "Jour J", `${base}/entries`, "door"],
    ]);
    expect(r.more.map((s) => [s.label, s.items.map((i) => i.label)])).toEqual([
      ["Billetterie", ["Plan de salle"]],
      ["Participants", ["Revente"]],
      ["Vente et promotion", ["Codes promo", "Réseaux de vente"]],
      ["Réglages", ["Réglages"]],
    ]);
    expect(activeTab(r.tabs, `${base}/seating`)).toBe("ticketing");
    expect(activeTab(r.tabs, `${base}/promo`)).toBeNull();
  });
});
