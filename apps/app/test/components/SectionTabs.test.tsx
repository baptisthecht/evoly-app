import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/shell/PageHeader";
import { SectionTabs } from "@/components/shell/SectionTabs";

const nav = vi.hoisted(() => ({ path: "/o/club/marketing", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
const tabs = [
  { label: "Contacts", href: "/o/club/marketing" },
  {
    label: "Campagnes",
    href: "/o/club/marketing?tab=campaigns",
    match: "/o/club/marketing/campaigns",
  },
];
const active = () =>
  screen
    .getAllByRole("link")
    .filter((l) => l.getAttribute("aria-current") === "page")
    .map((l) => l.textContent);

describe("onglets de section (bande d'en-tête)", () => {
  it("onglet par défaut, onglet par paramètre d'adresse, page rattachée à un onglet", () => {
    const { rerender } = render(<SectionTabs tabs={tabs} label="Sections" />);
    expect(active()).toEqual(["Contacts"]);
    nav.search = "tab=campaigns";
    rerender(<SectionTabs tabs={tabs} label="Sections" />);
    expect(active()).toEqual(["Campagnes"]);
    nav.path = "/o/club/marketing/campaigns/c1";
    nav.search = "";
    rerender(<SectionTabs tabs={tabs} label="Sections" />);
    expect(active()).toEqual(["Campagnes"]);
  });

  it("bande : titre en niveau 1, boutons à droite, onglets seulement s'il y en a", () => {
    nav.path = "/o/club/marketing";
    const { rerender } = render(
      <PageHeader
        title="Marketing"
        tabs={tabs}
        tabsLabel="Sections"
        actions={<a href="/x">Nouvelle campagne</a>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Marketing" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Nouvelle campagne" }),
    ).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    rerender(<PageHeader title="Commandes" />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
