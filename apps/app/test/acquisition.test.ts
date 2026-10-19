import { acquisitionFromVisit } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 10);
const user = async () => db.user.create({ data: { name: "Camille", email: `src.${rid()}@exemple.be`, emailVerified: true } });

describe("source de l'inscription enregistrée sur l'organisation (traçage, docs/TRACKING.md)", () => {
  it("campagne et identifiant de clic gardés sur l'organisation créée", async () => {
    const u = await user();
    const acq = acquisitionFromVisit({
      url: "https://evoly.me/?utm_source=google&utm_medium=cpc&utm_campaign=billetterie-be&gclid=Cj0abc",
      referrer: "",
      baseDomain: "evoly.me",
      adsAllowed: true,
    });
    const org = await createOrganization(u.id, { name: "Club", subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never, acq);
    const row = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(row.acquisition).toMatchObject({ source: "google", medium: "cpc", campaign: "billetterie-be", gclid: "Cj0abc" });
  });

  it("sans source : rien n'est enregistré", async () => {
    const u = await user();
    const org = await createOrganization(u.id, { name: "Club", subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never);
    expect((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).acquisition).toBeNull();
  });
});
