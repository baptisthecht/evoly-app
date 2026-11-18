import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import type { OrgContext } from "@/server/context";

// bandeau de l'accueil tant que le compte Mollie n'est pas prêt (RG-ONB-03, RG-FIN-02) : composant serveur asynchrone,
// rendu ici avec les vrais textes français
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: "fr",
      messages: fr,
      namespace: namespace as "dashboard",
    }),
}));

const { MollieBanner } = await import("@/app/o/[orgSlug]/MollieBanner");

const d = fr.dashboard as Record<string, string>;
const m = fr.mollie as Record<string, string>;
type Mollie = NonNullable<OrgContext["mollie"]>;
const account = (over: Partial<Mollie> = {}): Mollie => ({
  ready: false,
  disconnected: false,
  onboardingStatus: "NEEDS_DATA",
  canReceivePayments: false,
  canReceiveSettlements: false,
  profileStatus: null,
  methods: [],
  onboardingUrl: null,
  testmode: false,
  ...over,
});
const ctx = (mollie: Mollie | null, permissions = ["PAYMENTS_MANAGE"]) =>
  ({
    organization: { slug: "club" },
    membership: {
      status: "ACTIVE",
      systemRole: null,
      permissions,
      roleName: "Trésorier",
    },
    mollie,
  }) as unknown as OrgContext;
const draw = async (c: OrgContext) =>
  render(<>{await MollieBanner({ ctx: c })}</>);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const banner = () => screen.getByRole("status");

describe("bandeau Mollie de l'accueil", () => {
  it("aucun compte relié : invitation à relier Mollie, vers Paramètres, Paiements", async () => {
    await draw(ctx(null));
    expect(norm(banner().textContent!)).toContain(norm(d.mollieMissingTitle!));
    expect(norm(banner().textContent!)).toContain(norm(d.mollieMissingBody!));
    expect(
      screen
        .getByRole("link", { name: d.mollieMissingCta })
        .getAttribute("href"),
    ).toBe("/o/club/settings/payments");
    expect(banner().className).toContain("bg-warning-soft");
  });

  it("configuration en cours : informations à donner (à terminer) ou vérification chez Mollie (rien à faire), l'étape expliquée", async () => {
    for (const [over, state, key] of [
      [{ onboardingStatus: "NEEDS_DATA" }, "needsData", "molliePending"],
      [{ onboardingStatus: "IN_REVIEW" }, "inReview", "mollieReview"],
      [{ onboardingStatus: "COMPLETED" }, "pending", "mollieReview"],
    ] as const) {
      const { unmount } = await draw(ctx(account(over)));
      expect(norm(banner().textContent!)).toContain(norm(d[`${key}Title`]!));
      expect(norm(banner().textContent!)).toContain(
        norm(m[`explain_${state}`]!),
      );
      expect(screen.getByRole("link", { name: d[`${key}Cta`] })).toBeTruthy();
      unmount();
    }
  });

  it("compte qui n'est plus relié : action requise, en rouge", async () => {
    await draw(
      ctx(account({ disconnected: true, onboardingStatus: "COMPLETED" })),
    );
    expect(norm(banner().textContent!)).toContain(norm(d.mollieActionTitle!));
    expect(norm(banner().textContent!)).toContain(
      norm(m.explain_disconnected!),
    );
    expect(screen.getByRole("link", { name: d.mollieActionCta })).toBeTruthy();
    expect(banner().className).toContain("bg-danger-soft");
  });

  it("compte prêt, ou membre sans droit sur les paiements : aucun bandeau", async () => {
    const ready = account({ ready: true, onboardingStatus: "COMPLETED" });
    const { container, unmount } = await draw(ctx(ready));
    expect(container.textContent).toBe("");
    unmount();
    const other = await draw(ctx(null, ["ORDERS_VIEW"]));
    expect(other.container.textContent).toBe("");
  });
});
