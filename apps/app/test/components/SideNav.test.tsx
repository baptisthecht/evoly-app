import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SideNav, type NavSection } from "@/components/shell/SideNav";

const nav = { path: "/o/club/finances" };
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

const sections: NavSection[] = [
  {
    label: "Piloter",
    icon: "pilot",
    items: [
      { label: "Accueil", href: "/o/club", exact: true },
      { label: "Finances", href: "/o/club/finances" },
      { label: "Commandes", href: "/o/club/orders?event=e1" },
    ],
  },
  { label: "Organisation", icon: "org", items: [{ label: "Abonnement", href: "/o/club/billing", pro: "Pro" }] },
];
const draw = () =>
  render(
    <SideNav
      label="Navigation principale"
      before={<p>avant</p>}
      top={{ label: "Vue d’ensemble", href: "/o/club/events/e1", exact: true, icon: "grid" }}
      sections={sections}
      after={<p>après</p>}
      bottom={[{ label: "Réglages", href: "/o/club/events/e1/settings", icon: "settings" }]}
    />,
  );
const link = (name: string) => screen.getByRole("link", { name: new RegExp(`^${name}`) });
const cls = (name: string) => link(name).className.split(/\s+/);

beforeEach(() => {
  nav.path = "/o/club/finances";
});

describe("barre latérale (indications du 18 octobre 2026)", () => {
  it("page active : texte en gras, segment du trait en rose ; ni fond, ni arrondi", () => {
    draw();
    expect(link("Finances").getAttribute("aria-current")).toBe("page");
    expect(cls("Finances")).toEqual(expect.arrayContaining(["font-semibold", "border-rose", "border-l-2"]));
    for (const name of ["Finances", "Accueil", "Commandes", "Vue d’ensemble", "Réglages"]) {
      expect(cls(name).some((c) => /^(hover:)?bg-|^(hover:)?rounded/.test(c))).toBe(false); // jamais de fond ni d'arrondi
    }
  });

  it("survol : texte en gras seulement ; les autres pages gardent le trait gris", () => {
    draw();
    expect(link("Accueil").getAttribute("aria-current")).toBeNull();
    expect(cls("Accueil")).toEqual(expect.arrayContaining(["hover:font-semibold", "font-medium", "border-line"]));
    expect(cls("Accueil")).not.toContain("border-rose");
  });

  it("la catégorie de la page ouverte est active elle aussi ; les autres restent discrètes", () => {
    draw();
    expect(screen.getByText("Piloter").className).toContain("text-ink");
    expect(screen.getByText("Piloter").className).not.toContain("text-ink-muted");
    expect(screen.getByText("Organisation").className).toContain("text-ink-muted");
  });

  it("correspondance des adresses : exacte pour l'accueil, par préfixe pour les autres, paramètres ignorés", () => {
    nav.path = "/o/club/orders";
    draw();
    expect(link("Commandes").getAttribute("aria-current")).toBe("page"); // ?event=e1 ignoré
    expect(link("Accueil").getAttribute("aria-current")).toBeNull(); // /o/club ne s'allume pas pour ses sous-pages
    nav.path = "/o/club/events/e1/settings/advanced";
    draw();
    expect(screen.getAllByRole("link", { name: "Réglages" }).at(-1)!.getAttribute("aria-current")).toBe("page");
  });

  it("entrées seules (vue d'ensemble, réglages) : même règle, repère rose à gauche quand elles sont ouvertes", () => {
    nav.path = "/o/club/events/e1";
    draw();
    expect(link("Vue d’ensemble").getAttribute("aria-current")).toBe("page");
    expect(cls("Vue d’ensemble")).toEqual(expect.arrayContaining(["font-semibold", "border-rose"]));
    expect(cls("Réglages")).toEqual(expect.arrayContaining(["border-transparent", "hover:font-semibold"]));
  });

  it("blocs avant et après, badge Pro, séparateur des entrées du bas", () => {
    draw();
    expect(screen.getByText("avant")).toBeTruthy();
    expect(screen.getByText("après")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeTruthy();
  });
});
