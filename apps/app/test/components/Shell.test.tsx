import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Shell } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { Fr } from "./intl";

const nav = vi.hoisted(() => ({ path: "/o/club" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
const view = () => (
  <Fr>
    <Shell
      nav={<p>barre de navigation</p>}
      orgSwitcher={<p>organisation</p>}
      account={<p>compte</p>}
      bell={<a href="/notifications">cloche</a>}
      tabBar={
        <TabBar
          label="Navigation de l’organisation"
          tabs={[
            {
              key: "home",
              label: "Accueil",
              href: "/o/club",
              icon: "home",
              exact: true,
            },
          ]}
          more={[
            {
              label: "Organisation",
              items: [{ label: "Paramètres", href: "/o/club/settings" }],
            },
          ]}
        />
      }
    >
      <p>contenu de la page</p>
    </Shell>
  </Fr>
);

describe("coquille de l'espace organisateur", () => {
  it("téléphone : plus de bouton « Menu » ; la barre d'onglets, avec l'organisation et le compte dans « Plus »", async () => {
    render(view());
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Navigation de l’organisation" }),
    ).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Plus" }));
    const sheet = screen.getByRole("dialog", { name: "Autres pages" });
    expect(within(sheet).getByText("organisation")).toBeTruthy();
    expect(within(sheet).getByText("compte")).toBeTruthy();
    expect(screen.getByText("contenu de la page")).toBeTruthy();
  });
});
