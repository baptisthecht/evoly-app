import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SocialError } from "@/app/(auth)/SocialError";
import { Fr } from "./intl";

// retour de Google ou d'Apple sans connexion
const t = (fr as unknown as Record<string, Record<string, string>>).auth!;

describe("connexion par Google ou Apple : retour sans connexion", () => {
  it("annulée par l'organisateur ; autre erreur ; aucune erreur : rien", () => {
    const { rerender, container } = render(
      <Fr>
        <SocialError error="access_denied" />
      </Fr>,
    );
    expect(screen.getByRole("alert").textContent).toBe(t.socialCancelled);
    rerender(
      <Fr>
        <SocialError error="unable_to_get_user_info" />
      </Fr>,
    );
    expect(screen.getByRole("alert").textContent).toBe(t.socialError);
    rerender(
      <Fr>
        <SocialError error={null} />
      </Fr>,
    );
    expect(container.textContent).toBe("");
  });
});
