import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ThemeFields, ThemePreview, type ThemeValues } from "@/app/o/[orgSlug]/brand/BrandTheme";
import { Fr } from "./intl";

const t = (fr as unknown as Record<string, Record<string, string>>).brand!;
const empty: ThemeValues = {
  primaryColor: "",
  accentColor: "",
  backgroundColor: "",
  radius: "",
  headingFont: "",
  bodyFont: "",
  buttonLabel: "",
  socials: { website: "", instagram: "", facebook: "", tiktok: "", linkedin: "", youtube: "" },
};
function Harness({ start = empty }: { start?: ThemeValues }) {
  const [v, setV] = useState(start);
  return (
    <form data-testid="form">
      <ThemeFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} />
      <ThemePreview v={v} name="Club" logoUrl="" poweredBy={null} labels={{ date: "Sam. 20 févr.", title: "Gala", ticket: "Entrée", button: "Réserver" }} />
    </form>
  );
}
const preview = () => screen.getByTestId("brand-preview");

describe("écran de réglage du thème de la billetterie", () => {
  it("style prêt à l'emploi : couleurs, fond, arrondi et polices appliqués, l'aperçu le reflète", () => {
    render(
      <Fr>
        <Harness />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.preset_gala!) }));
    expect((document.getElementById("backgroundColor") as HTMLInputElement).value).toBe("#FAF7F2");
    expect((document.getElementById("headingFont") as HTMLSelectElement).value).toBe("playfair-display");
    expect((screen.getByRole("radio", { name: t.radius_soft }) as HTMLInputElement).checked).toBe(true);
    expect(preview().style.getPropertyValue("--surface")).toBe("#FAF7F2");
    expect(preview().style.getPropertyValue("--control-radius")).toBe("6px");
    expect(screen.getByText(t.readable!)).toBeTruthy();
  });

  it("lisibilité : bouton peu visible signalé, la teinte proposée s'applique d'un clic", () => {
    render(
      <Fr>
        <Harness start={{ ...empty, accentColor: "#F5EFE6", backgroundColor: "#FAF7F2" }} />
      </Fr>,
    );
    const alert = screen.getAllByRole("alert").find((a) => a.textContent!.includes(t.warn_accentOnBackground!.split(" (")[0]!))!;
    fireEvent.click(alert.querySelector("button")!);
    expect(screen.queryAllByRole("alert").some((a) => a.textContent!.includes(t.warn_accentOnBackground!.split(" (")[0]!))).toBe(false);
  });

  it("bouton d'achat et réseaux sociaux : dans l'aperçu et dans le formulaire envoyé", () => {
    render(
      <Fr>
        <Harness />
      </Fr>,
    );
    fireEvent.change(document.getElementById("buttonLabel")!, { target: { value: "Je participe" } });
    fireEvent.change(document.getElementById("social_instagram")!, { target: { value: "https://instagram.com/club" } });
    expect(preview().textContent).toContain("Je participe");
    expect(preview().textContent).toContain("instagram");
    const data = new FormData(screen.getByTestId("form") as HTMLFormElement);
    expect([data.get("buttonLabel"), data.get("social_instagram"), data.get("radius")]).toEqual(["Je participe", "https://instagram.com/club", ""]);
  });
});
