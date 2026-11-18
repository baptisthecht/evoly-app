import { afterEach, describe, expect, it, vi } from "vitest";

process.env.MOLLIE_CLIENT_ID = "app_essai_evoly";
process.env.MOLLIE_CLIENT_SECRET = "secret_essai_evoly";

const { db } = await import("@/lib/db");
const { sealer } = await import("@/lib/seal");
const {
  mollieAccessToken,
  mollieForOrganization,
  revokeMollieAuthorization,
  saveMollieAuthorization,
} = await import("@/server/mollieAccounts");

const sealed = sealer("mollie-oauth");
type Seen = { url: URL; method: string; body: string; auth: string | null };
const seen: Seen[] = [];

/** Mollie répond, dans l'ordre, par les réponses données (statut et corps JSON). */
function mollieReplies(...replies: Array<[number, unknown?]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      seen.push({
        url: new URL(String(url)),
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? init.body : "",
        auth: new Headers(init.headers).get("authorization"),
      });
      const [status, body] = replies.shift() ?? [500, { title: "inattendu" }];
      return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      });
    }),
  );
}
const noMollieCall = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("aucun appel à Mollie attendu");
    }),
  );

afterEach(() => {
  seen.length = 0;
  vi.unstubAllGlobals();
});

async function organization() {
  const id = Math.random().toString(36).slice(2, 10);
  return db.organization.create({
    data: {
      name: `Cercle ${id}`,
      slug: `cercle-${id}`,
      subdomain: `cercle-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
      contactEmail: `contact.${id}@exemple.be`,
    },
  });
}
const tokens = (access: string, refresh?: string) => ({
  access_token: access,
  ...(refresh ? { refresh_token: refresh } : {}),
  expires_in: 3600,
  token_type: "bearer",
  scope: "payments.read payments.write onboarding.read",
});
const mollieOrg = () => `org_${Math.random().toString(36).slice(2, 10)}`;

describe("comptes Mollie des organisateurs : jetons OAuth", () => {
  it("jetons chiffrés en base ; jeton d'accès valable rendu sans appel à Mollie", async () => {
    const org = await organization();
    const account = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: mollieOrg(),
      tokens: tokens("access_1", "refresh_1"),
      testmode: true,
    });
    expect(account.refreshToken).not.toContain("refresh_1");
    expect(account.accessToken).not.toContain("access_1");
    expect(sealed.open(account.refreshToken)).toBe("refresh_1");
    expect(account.scopes).toEqual([
      "payments.read",
      "payments.write",
      "onboarding.read",
    ]);
    expect(account.testmode).toBe(true);
    expect(account.onboardingStatus).toBe("NEEDS_DATA");
    const left = account.accessTokenExpiresAt!.getTime() - Date.now();
    expect(left).toBeGreaterThan(3500_000);
    noMollieCall();
    expect(await mollieAccessToken(account)).toBe("access_1");
  });

  it("jeton d'accès à moins de 5 minutes de l'expiration : renouvelé, et le nouveau jeton de renouvellement gardé", async () => {
    const org = await organization();
    const saved = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: mollieOrg(),
      tokens: tokens("access_1", "refresh_1"),
      testmode: false,
    });
    const account = await db.mollieAccount.update({
      where: { id: saved.id },
      data: { accessTokenExpiresAt: new Date(Date.now() + 2 * 60_000) },
    });
    mollieReplies([200, tokens("access_2", "refresh_2")]);
    expect(await mollieAccessToken(account)).toBe("access_2");
    expect(Object.fromEntries(new URLSearchParams(seen[0]!.body))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh_1",
    });
    const after = await db.mollieAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(sealed.open(after.accessToken!)).toBe("access_2");
    expect(sealed.open(after.refreshToken)).toBe("refresh_2");
    expect(after.accessTokenExpiresAt!.getTime() - Date.now()).toBeGreaterThan(
      3500_000,
    );
    // sans nouveau jeton de renouvellement dans la réponse, l'ancien reste
    const again = await db.mollieAccount.update({
      where: { id: account.id },
      data: { accessTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    vi.unstubAllGlobals();
    mollieReplies([200, tokens("access_3")]);
    expect(await mollieAccessToken(again)).toBe("access_3");
    const last = await db.mollieAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(sealed.open(last.refreshToken)).toBe("refresh_2");
  });

  it("autorisation retirée chez Mollie (invalid_grant) : compte à relier, plus aucun appel ensuite", async () => {
    const org = await organization();
    const saved = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: mollieOrg(),
      tokens: tokens("access_1", "refresh_1"),
      testmode: false,
    });
    const account = await db.mollieAccount.update({
      where: { id: saved.id },
      data: { accessTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    mollieReplies([
      400,
      { error: "invalid_grant", error_description: "revoked" },
    ]);
    await expect(mollieAccessToken(account)).rejects.toMatchObject({
      code: "MOLLIE_RECONNECT_REQUIRED",
    });
    const after = await db.mollieAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(after.disconnectedAt).not.toBeNull();
    expect(after.accessToken).toBeNull();
    noMollieCall();
    await expect(mollieAccessToken(after)).rejects.toMatchObject({
      code: "MOLLIE_RECONNECT_REQUIRED",
    });
  });

  it("renouvellements simultanés : le jeton périmé est refusé, mais un autre appel l'a déjà remplacé, on garde le compte", async () => {
    const org = await organization();
    const saved = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: mollieOrg(),
      tokens: tokens("access_1", "refresh_1"),
      testmode: false,
    });
    const stale = await db.mollieAccount.update({
      where: { id: saved.id },
      data: { accessTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    // l'autre appel a renouvelé : nouveau jeton de renouvellement et jeton d'accès valable en base
    await db.mollieAccount.update({
      where: { id: saved.id },
      data: {
        refreshToken: sealed.seal("refresh_2"),
        accessToken: sealed.seal("access_2"),
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    mollieReplies([400, { error: "invalid_grant" }]);
    expect(await mollieAccessToken(stale)).toBe("access_2");
    const after = await db.mollieAccount.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(after.disconnectedAt).toBeNull();
  });

  it("un compte Mollie ne sert qu'une organisation ; relié à un autre compte, l'organisation repart de zéro", async () => {
    const [a, b] = [await organization(), await organization()];
    const shared = mollieOrg();
    await saveMollieAuthorization({
      organizationId: a.id,
      mollieOrganizationId: shared,
      tokens: tokens("access_a", "refresh_a"),
      testmode: false,
    });
    await expect(
      saveMollieAuthorization({
        organizationId: b.id,
        mollieOrganizationId: shared,
        tokens: tokens("access_b", "refresh_b"),
        testmode: false,
      }),
    ).rejects.toMatchObject({ code: "MOLLIE_ACCOUNT_IN_USE" });
    await db.mollieAccount.update({
      where: { organizationId: a.id },
      data: {
        profileId: "pfl_a",
        methods: ["bancontact"],
        onboardingStatus: "COMPLETED",
        canReceivePayments: true,
        disconnectedAt: new Date(),
      },
    });
    // même compte Mollie relié de nouveau : profil et état gardés
    const same = await saveMollieAuthorization({
      organizationId: a.id,
      mollieOrganizationId: shared,
      tokens: tokens("access_a2", "refresh_a2"),
      testmode: false,
    });
    expect(same).toMatchObject({
      profileId: "pfl_a",
      methods: ["bancontact"],
      onboardingStatus: "COMPLETED",
      canReceivePayments: true,
      disconnectedAt: null,
    });
    // autre compte Mollie : tout est à refaire
    const other = await saveMollieAuthorization({
      organizationId: a.id,
      mollieOrganizationId: mollieOrg(),
      tokens: tokens("access_a3", "refresh_a3"),
      testmode: false,
    });
    expect(other).toMatchObject({
      profileId: null,
      methods: [],
      onboardingStatus: "NEEDS_DATA",
      canReceivePayments: false,
    });
    await expect(
      saveMollieAuthorization({
        organizationId: a.id,
        mollieOrganizationId: mollieOrg(),
        tokens: tokens("access_sans_renouvellement"),
        testmode: false,
      }),
    ).rejects.toMatchObject({ code: "MOLLIE_UNAVAILABLE" });
  });

  it("API pour une organisation : rien sans compte ; avec un compte relié en mode test, jeton en Bearer et testmode", async () => {
    const org = await organization();
    noMollieCall();
    expect(await mollieForOrganization(org.id)).toBeNull();
    await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: mollieOrg(),
      tokens: tokens("access_t", "refresh_t"),
      testmode: true,
    });
    vi.unstubAllGlobals();
    mollieReplies([200, { status: "in-review" }]);
    const mollie = await mollieForOrganization(org.id);
    expect(await mollie!.api("/onboarding/me")).toEqual({
      status: "in-review",
    });
    expect(seen[0]!.url.pathname).toBe("/v2/onboarding/me");
    expect(seen[0]!.url.searchParams.get("testmode")).toBe("true");
    expect(seen[0]!.auth).toBe("Bearer access_t");
  });

  it("déconnexion : jeton de renouvellement révoqué chez Mollie ; déjà retiré chez Mollie, la déconnexion se fait quand même", async () => {
    const org = await organization();
    const account = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: mollieOrg(),
      tokens: tokens("access_1", "refresh_1"),
      testmode: false,
    });
    mollieReplies([204]);
    await revokeMollieAuthorization(account);
    expect(seen[0]!.method).toBe("DELETE");
    expect(Object.fromEntries(new URLSearchParams(seen[0]!.body))).toEqual({
      token_type_hint: "refresh_token",
      token: "refresh_1",
    });
    const after = await db.mollieAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(after.disconnectedAt).not.toBeNull();
    expect(after.accessToken).toBeNull();
    const back = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: after.mollieOrganizationId,
      tokens: tokens("access_2", "refresh_2"),
      testmode: false,
    });
    vi.unstubAllGlobals();
    mollieReplies([401, { status: 401, title: "Unauthorized Request" }]);
    await revokeMollieAuthorization(back);
    expect(
      (await db.mollieAccount.findUniqueOrThrow({ where: { id: back.id } }))
        .disconnectedAt,
    ).not.toBeNull();
  });
});
