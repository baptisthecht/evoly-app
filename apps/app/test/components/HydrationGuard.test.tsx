import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { AlertForm } from "@/components/public/AlertForm";
import { LookupForm } from "@/components/public/LookupForm";
import { Fr } from "./intl";

vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => ({
  lookupTicketsAction: vi.fn(),
  subscribeAlertAction: vi.fn(),
}));
const o = fr.orders as Record<string, string>;
const labels = {
  title: "Prévenez-moi",
  intro: "Un e-mail à l'ouverture",
  email: "Votre e-mail",
  submit: "Avertissez-moi", // sans apostrophe : comparée au HTML du serveur, où elle serait échappée
  consent: "Seulement pour cette alerte",
  done: "C'est noté",
  error: "Erreur",
  invalid: "Adresse invalide",
  limited: "Trop de tentatives",
};
// le bouton d'envoi tel que le serveur l'écrit dans la page, avant que React la rende active
const serverButton = (html: string, text: string) =>
  new RegExp(`<button[^>]*\\sdisabled=""[^>]*>${text}</button>`).test(html); // l'attribut, pas les classes « disabled:… »

describe("formulaires publics avant que la page soit active (garde d'envoi, 16 novembre 2026)", () => {
  it("« Recevoir mes liens » et « M’avertir » : inactifs dans la page du serveur, actifs une fois la page active", () => {
    expect(
      serverButton(
        renderToString(
          <Fr>
            <LookupForm sub="club" />
          </Fr>,
        ),
        o.lookupSubmit!,
      ),
    ).toBe(true);
    expect(
      serverButton(
        renderToString(<AlertForm eventId="e1" labels={labels} />),
        labels.submit,
      ),
    ).toBe(true);
    render(
      <Fr>
        <LookupForm sub="club" />
      </Fr>,
    );
    expect(
      (
        screen.getByRole("button", {
          name: o.lookupSubmit,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
