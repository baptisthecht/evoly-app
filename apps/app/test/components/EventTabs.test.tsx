import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { activeEventTab, buildEventTabs } from "@/components/shell/eventTabs";
import { EventSubTabs, EventTabs } from "@/components/shell/EventTabs";
import { ShareLink } from "@/components/shell/ShareLink";
import { Fr } from "./intl";

const nav = vi.hoisted(() => ({ path: "/o/club/events/e1" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
const n = (fr as unknown as Record<string, Record<string, string>>).nav!;
const base = "/o/club/events/e1";
const build = (
  used = { seating: false, options: false, ambassadors: false },
  canPublish = true,
) => buildEventTabs({ t: (k) => n[k] ?? k, base, used, canPublish });
afterEach(() => vi.unstubAllGlobals());

describe("onglets d'un événement : construction", () => {
  it("sept parties (arborescence du 28 octobre 2026) ; toutes les fonctionnalités affichées directement ; « Publication » seulement avec le droit de publier", () => {
    const { tabs, hidden } = build(
      { seating: false, options: false, ambassadors: false },
      false,
    );
    expect(tabs.map((t) => t.label)).toEqual([
      n.eventOverview,
      n.groupTicketing,
      n.groupAttendees,
      n.groupAppearance,
      n.groupSales,
      n.groupDayOf,
      n.eventSettings,
    ]);
    expect(tabs[1]!.items.map((i) => i.label)).toEqual([
      n.tickets,
      n.complimentary,
      n.questions,
      n.options,
      n.tables,
      n.seating,
    ]);
    expect(tabs[3]!.items.map((i) => i.label)).toEqual([
      n.eventPage,
      n.images,
      n.emails,
    ]);
    expect(tabs[4]!.items.map((i) => i.label)).toEqual([
      n.diffusion,
      n.promo,
      n.ambassadors,
      n.distribution,
      n.waitlist,
    ]);
    expect(tabs[6]!.items.map((i) => i.label)).toEqual([
      n.settingsGeneral,
      n.settingsVenue,
      n.settingsSales,
      n.settingsAdvanced,
    ]);
    expect(hidden).toEqual([]);
    expect(
      build(
        { seating: true, options: true, ambassadors: true },
        true,
      ).tabs[4]!.items.map((i) => i.label),
    ).toEqual([
      n.launch,
      n.diffusion,
      n.promo,
      n.ambassadors,
      n.distribution, // réseaux de vente (Ticketmaster, Fnac, BilletReduc…)
      n.waitlist,
    ]);
  });

  it("partie active selon la page, sous-pages comprises", () => {
    const { tabs, hidden } = build();
    expect(activeEventTab(tabs, hidden, base)).toBe("overview");
    expect(activeEventTab(tabs, hidden, `${base}/tickets`)).toBe("ticketing");
    expect(activeEventTab(tabs, hidden, `${base}/orders/abc123`)).toBe(
      "attendees",
    );
    expect(activeEventTab(tabs, hidden, `${base}/settings/`)).toBe("settings");
    expect(activeEventTab(tabs, hidden, `${base}/seating`)).toBe("ticketing");
    expect(activeEventTab(tabs, hidden, `${base}/ambassadors`)).toBe("sales");
  });
});

describe("onglets d'un événement : affichage", () => {
  const draw = (path: string) => {
    nav.path = path;
    const { tabs, hidden } = build();
    return render(
      <Fr>
        <EventTabs tabs={tabs} hidden={hidden} />
        <EventSubTabs tabs={tabs} hidden={hidden} />
      </Fr>,
    );
  };

  it("onglet actif marqué ; seconde rangée avec toutes les pages de la partie, sans menu à déplier", () => {
    draw(`${base}/tables`);
    const sections = screen.getByRole("navigation", { name: n.eventSections });
    expect(
      within(sections)
        .getByRole("link", { name: n.groupTicketing })
        .getAttribute("aria-current"),
    ).toBe("page");
    const pages = screen.getByRole("navigation", { name: n.sectionPages });
    expect(
      within(pages)
        .getAllByRole("link")
        .map((l) => [l.textContent, l.getAttribute("aria-current")]),
    ).toEqual([
      [n.tickets, null],
      [n.complimentary, null],
      [n.questions, null],
      [n.options, null],
      [n.tables, "page"],
      [n.seating, null],
    ]);
    expect(screen.queryByText(new RegExp(n.addFeature!))).toBeNull();
  });

  it("vue d'ensemble : pas de seconde rangée", () => {
    draw(base);
    expect(
      screen.queryByRole("navigation", { name: n.sectionPages }),
    ).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: n.eventSections }))
        .getByRole("link", { name: n.eventOverview })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});

describe("partager le lien d'un événement", () => {
  it("sur ordinateur : lien copié, puis confirmation", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
      share: undefined,
    });
    render(
      <Fr>
        <ShareLink url="https://club.evoly.me/gala" title="Gala" />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: n.shareLink })),
    );
    expect(writeText).toHaveBeenCalledWith("https://club.evoly.me/gala");
    expect(screen.getByRole("button", { name: n.linkCopied })).toBeTruthy();
  });

  it("sur téléphone : le partage du téléphone", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", {
      ...navigator,
      share,
      clipboard: { writeText: vi.fn() },
    });
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("coarse"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    render(
      <Fr>
        <ShareLink url="https://club.evoly.me/gala" title="Gala" />
      </Fr>,
    );
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: n.shareLink })),
    );
    expect(share).toHaveBeenCalledWith({
      url: "https://club.evoly.me/gala",
      title: "Gala",
    });
  });
});
