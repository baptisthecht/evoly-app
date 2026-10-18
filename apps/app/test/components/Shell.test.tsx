import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Shell } from "@/components/shell/Sidebar";
import { Fr } from "./intl";

const nav = vi.hoisted(() => ({ path: "/o/club" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
const view = () => (
  <Fr>
    <Shell nav={<p>barre de navigation</p>} orgSwitcher={<p>organisation</p>} account={<p>compte</p>} bell={<a href="/notifications">cloche</a>}>
      <p>contenu de la page</p>
    </Shell>
  </Fr>
);

describe("coquille de l'espace organisateur", () => {
  it("téléphone : le menu s'ouvre et se referme, avec son état annoncé", async () => {
    render(view());
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("mobile-nav")).toBeNull();
    await user.click(button);
    expect(document.getElementById("mobile-nav")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Fermer" }).getAttribute("aria-expanded")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(document.getElementById("mobile-nav")).toBeNull();
    expect(screen.getByText("contenu de la page")).toBeTruthy();
  });

  it("le menu se referme tout seul quand on change de page", async () => {
    const r = render(view());
    await userEvent.setup().click(screen.getByRole("button", { name: "Menu" }));
    expect(document.getElementById("mobile-nav")).not.toBeNull();
    nav.path = "/o/club/events";
    r.rerender(view());
    expect(document.getElementById("mobile-nav")).toBeNull();
  });
});
