import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { EventThemeForm } from "@/app/o/[orgSlug]/events/[eventId]/appearance/EventThemeForm";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ saveEventThemeAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/events/[eventId]/appearance/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>).brand!;
const values = {
  primaryColor: "#222222",
  accentColor: "#FFB8E8",
  backgroundColor: "",
  radius: "",
  headingFont: "",
  bodyFont: "",
  buttonLabel: "",
  socials: {
    website: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    linkedin: "",
    youtube: "",
  },
};
beforeEach(() => {
  actions.saveEventThemeAction.mockReset();
  actions.saveEventThemeAction.mockResolvedValue({ ok: true });
});

describe("style de la billetterie d'un événement", () => {
  it("style de l'organisation par défaut : aucun réglage affiché ; personnaliser : réglages et aperçu, sans réseaux sociaux", () => {
    render(
      <Fr>
        <EventThemeForm
          orgSlug="club"
          eventId="e1"
          custom={false}
          values={values}
          name="Club"
          logoUrl=""
        />
      </Fr>,
    );
    expect(screen.queryByTestId("brand-preview")).toBeNull();
    fireEvent.click(
      screen.getByRole("radio", { name: new RegExp(`^${t.eventStyleCustom}`) }),
    );
    expect(screen.getByTestId("brand-preview")).toBeTruthy();
    expect(document.getElementById("social_instagram")).toBeNull();
  });

  it("enregistrement : mode et réglages envoyés, puis confirmés", async () => {
    render(
      <Fr>
        <EventThemeForm
          orgSlug="club"
          eventId="e1"
          custom
          values={values}
          name="Club"
          logoUrl=""
        />
      </Fr>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(t.preset_festival!) }),
    );
    await act(
      async () =>
        void fireEvent.submit(
          document.getElementById("ev-accentColor")!.closest("form")!,
        ),
    );
    await waitFor(() =>
      expect(actions.saveEventThemeAction).toHaveBeenCalled(),
    );
    const data = actions.saveEventThemeAction.mock.calls[0]!.at(-1) as FormData;
    expect([
      data.get("mode"),
      data.get("accentColor"),
      data.get("radius"),
      data.get("headingFont"),
    ]).toEqual(["custom", "#FFD23F", "extra", "bebas-neue"]);
    expect(await screen.findByText(t.eventStyleSaved!)).toBeTruthy();
  });
});
