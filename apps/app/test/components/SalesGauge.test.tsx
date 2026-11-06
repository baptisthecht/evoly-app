import { render, screen } from "@testing-library/react";
import { salesPace } from "@evoly/core";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";

// les vrais textes français, formatés par next-intl (pluriels compris)
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: "fr",
      messages: fr,
      namespace: namespace as "pace",
    }),
}));

const { DateLeaf, SalesGauge } = await import("@/components/ui/SalesGauge");

const day = 86_400_000;
const start = new Date("2026-09-12T10:00:00Z");
const end = new Date(start.getTime() + 100 * day);
const at = (d: number) => new Date(start.getTime() + d * day);
const gauge = async (
  sold: number,
  capacity: number | null,
  now: Date,
  projection = false,
) =>
  render(
    await SalesGauge({
      sold,
      capacity,
      pace: salesPace({
        sold,
        capacity,
        salesStart: start,
        salesEnd: end,
        now,
      }),
      timezone: "Europe/Brussels",
      locale: "fr",
      projection,
    }),
  );

describe("jauge du rythme (refonte A3)", () => {
  it("en avance : le chiffre, le mot en vert, le trait rose et la date projetée du complet", async () => {
    const { container } = await gauge(312, 400, at(69), true);
    expect(screen.getByText("312 sur 400")).toBeTruthy();
    expect(screen.getByText("en avance").className).toContain("text-success");
    expect(
      screen.getByRole("img", {
        name: "312 places vendues sur 400, en avance",
      }),
    ).toBeTruthy();
    expect(container.querySelector(".bg-highlight")).not.toBeNull();
    expect(
      screen.getByText(/^À ce train, complet vers le \d+ \S+\.$/),
    ).toBeTruthy();
  });

  it("un peu lent : barre et mot en orange, pas de projection sans la demander", async () => {
    const { container } = await gauge(128, 250, at(62));
    expect(screen.getByText("un peu lent").className).toContain("text-warning");
    expect(container.querySelector(".bg-warning")).not.toBeNull();
    expect(screen.queryByText(/À ce train/)).toBeNull();
  });

  it("complet : barre verte, plus de trait du rythme", async () => {
    const { container } = await gauge(400, 400, at(50));
    expect(screen.getByText("complet")).toBeTruthy();
    expect(container.querySelector(".bg-success")).not.toBeNull();
    expect(container.querySelector(".bg-highlight")).toBeNull();
  });

  it("ventes pas encore ouvertes : pas de trait", async () => {
    const { container } = await gauge(0, 180, at(-5));
    expect(screen.getByText("ventes pas encore ouvertes")).toBeTruthy();
    expect(container.querySelector(".bg-highlight")).toBeNull();
  });

  it("jauge illimitée : le nombre de billets vendus, sans barre", async () => {
    await gauge(12, null, at(10));
    expect(screen.getByText("12 billets vendus")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("période de vente vide : le chiffre seul, sans mot ni trait", async () => {
    const sold = 3;
    const { container } = render(
      await SalesGauge({
        sold,
        capacity: 10,
        pace: salesPace({
          sold,
          capacity: 10,
          salesStart: start,
          salesEnd: start,
          now: at(1),
        }),
        timezone: "Europe/Brussels",
        locale: "fr",
      }),
    );
    expect(screen.getByText("3 sur 10")).toBeTruthy();
    expect(container.querySelector(".bg-highlight")).toBeNull();
  });
});

describe("feuille de calendrier", () => {
  it("le mois abrégé et le jour, dans le fuseau de l'événement", () => {
    render(
      <DateLeaf
        date={new Date("2026-11-21T19:00:00Z")}
        timezone="Europe/Brussels"
        locale="fr"
      />,
    );
    expect(screen.getByText("nov.")).toBeTruthy();
    expect(screen.getByText("21")).toBeTruthy();
  });
});
