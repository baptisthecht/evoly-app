import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.MOLLIE_CLIENT_ID = "app_essai_evoly";
process.env.MOLLIE_CLIENT_SECRET = "secret_essai_evoly";

const jar = new Map<string, { value: string; options?: unknown }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)!.value } : undefined,
    set: (name: string, value: string, options?: unknown) => {
      jar.set(name, { value, options });
    },
    delete: (o: string | { name: string }) => {
      jar.delete(typeof o === "string" ? o : o.name);
    },
  }),
  headers: async () => new Headers(),
}));
const session: { user: { id: string; email: string } | null } = { user: null };
vi.mock("@/server/session", () => ({
  getSession: async () =>
    session.user ? { user: session.user, session: { id: "s" } } : null,
  requireUser: async () => ({ user: session.user }),
}));

const { db } = await import("@/lib/db");
const { createOrganization } = await import("@/server/onboarding");
const { findOrgContext } = await import("@/server/context");
const { mollieReady, saveMollieAuthorization } =
  await import("@/server/mollieAccounts");
const {
  completeMollieConnection,
  disconnectMollie,
  readMollieState,
  startMollieConnection,
  syncMollieAccount,
  syncMollieAccounts,
} = await import("@/server/mollieConnect");

type Route = { method: string; path: string; status?: number; body?: unknown };
type Call = { method: string; url: URL; body: string; auth: string | null };
const calls: Call[] = [];

/** Mollie répond selon la méthode et le chemin ; chaque réponse ne sert qu'une fois, dans l'ordre donné. */
function mollie(...routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      calls.push({
        method,
        url,
        body: typeof init.body === "string" ? init.body : "",
        auth: new Headers(init.headers).get("authorization"),
      });
      const i = routes.findIndex(
        (r) => r.method === method && r.path === url.pathname,
      );
      if (i < 0)
        return new Response(
          JSON.stringify({
            status: 404,
            title: "Not Found",
            detail: url.pathname,
          }),
          { status: 404 },
        );
      const [r] = routes.splice(i, 1);
      return new Response(
        r!.body === undefined ? null : JSON.stringify(r!.body),
        {
          status: r!.status ?? 200,
        },
      );
    }),
  );
}

beforeEach(() => {
  jar.clear();
  calls.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const rid = () => Math.random().toString(36).slice(2, 8);
async function organizer() {
  const user = await db.user.create({
    data: {
      name: "Nora",
      email: `nora.${rid()}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await createOrganization(user.id, {
    name: `Cercle ${rid()}`,
    subdomain: `cercle-${rid()}`,
    country: "BE",
    type: "ASSOCIATION",
  } as never);
  const ctx = await findOrgContext(user.id, org.slug);
  session.user = { id: user.id, email: user.email };
  return {
    user,
    org,
    ctx: { user: { id: user.id, name: user.name, email: user.email }, ...ctx! },
  };
}
const tokens = {
  access_token: "access_1",
  refresh_token: "refresh_1",
  expires_in: 3600,
  token_type: "bearer",
  scope: "payments.read payments.write",
};
const onboarding = (status: string, canReceivePayments = false) => ({
  name: "Cercle",
  status,
  canReceivePayments,
  canReceiveSettlements: canReceivePayments,
  _links: {
    dashboard: { href: "https://my.mollie.com/dashboard/org_1/onboarding" },
  },
});

describe("relier son compte Mollie : départ vers Mollie", () => {
  it("téléphone au format international enregistré, état signé lié au navigateur, page d'autorisation complète", async () => {
    const { org, ctx, user } = await organizer();
    await expect(
      startMollieConnection(ctx, {
        phone: "appelez-moi",
        signup: true,
        from: "settings",
      }),
    ).rejects.toMatchObject({ code: "MOLLIE_PHONE_INVALID" });
    const href = await startMollieConnection(ctx, {
      phone: "0470 12 34 56",
      signup: true,
      from: "settings",
    });
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .phone,
    ).toBe("+32470123456");
    const cookie = jar.get("evoly_mollie")!;
    expect(cookie.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/api/mollie",
    });
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(
      "https://my.mollie.com/oauth2/authorize",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3001/api/mollie/oauth",
    );
    expect(url.searchParams.get("landing_page")).toBe("signup");
    expect(url.searchParams.get("locale")).toBe("fr_BE");
    const state = readMollieState(url.searchParams.get("state"));
    expect(state).toMatchObject({
      o: org.id,
      u: user.id,
      n: cookie.value,
      f: "settings",
    });
    // un état modifié n'est plus reconnu
    const raw = url.searchParams.get("state")!;
    const forged = Buffer.from(
      JSON.stringify({ ...state, o: "autre-organisation" }),
    ).toString("base64url");
    expect(readMollieState(`${forged}.${raw.split(".")[1]}`)).toBeNull();
    expect(readMollieState("n'importe quoi")).toBeNull();
  });
});

describe("relier son compte Mollie : retour de Mollie", () => {
  async function returnFrom(from: "settings" | "onboarding" = "settings") {
    const o = await organizer();
    const href = await startMollieConnection(o.ctx, {
      phone: "+32 470 12 34 56",
      signup: false,
      from,
    });
    const state = new URL(href).searchParams.get("state")!;
    return { ...o, state };
  }

  it("code échangé, compte enregistré, profil créé avec cartes, Bancontact et Apple Pay, état relu ; cookie effacé, action journalisée", async () => {
    const { org, user, state } = await returnFrom();
    const mollieOrg = `org_relie_${rid()}`;
    mollie(
      { method: "POST", path: "/oauth2/tokens", body: tokens },
      {
        method: "GET",
        path: "/v2/organizations/me",
        body: { id: mollieOrg, name: "Cercle" },
      },
      {
        method: "POST",
        path: "/v2/profiles",
        status: 201,
        body: { id: "pfl_1", status: "unverified" },
      },
      {
        method: "POST",
        path: "/v2/profiles/pfl_1/methods/creditcard",
        status: 201,
        body: { id: "creditcard" },
      },
      {
        method: "POST",
        path: "/v2/profiles/pfl_1/methods/bancontact",
        status: 201,
        body: { id: "bancontact" },
      },
      {
        method: "POST",
        path: "/v2/profiles/pfl_1/methods/applepay",
        status: 422,
        body: {
          status: 422,
          title: "Unprocessable Entity",
          detail: "credit card must be enabled first",
        },
      },
      {
        method: "GET",
        path: "/v2/onboarding/me",
        body: onboarding("needs-data"),
      },
      {
        method: "GET",
        path: "/v2/profiles/pfl_1",
        body: { id: "pfl_1", status: "unverified" },
      },
      {
        method: "GET",
        path: "/v2/methods",
        body: {
          count: 2,
          _embedded: { methods: [{ id: "creditcard" }, { id: "bancontact" }] },
          _links: { next: null },
        },
      },
    );
    const back = await completeMollieConnection(
      new URLSearchParams({ code: "code_1", state }),
    );
    expect(back).toBe(`/o/${org.slug}/settings/payments?mollie=connected`);
    expect(jar.has("evoly_mollie")).toBe(false);
    const account = await db.mollieAccount.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    expect(account).toMatchObject({
      mollieOrganizationId: mollieOrg,
      testmode: false,
      profileId: "pfl_1",
      profileStatus: "unverified",
      methods: ["creditcard", "bancontact"],
      onboardingStatus: "NEEDS_DATA",
      onboardingUrl: "https://my.mollie.com/dashboard/org_1/onboarding",
    });
    expect(account.syncedAt).not.toBeNull();
    const profile = calls.find(
      (c) => c.method === "POST" && c.url.pathname === "/v2/profiles",
    )!;
    expect(JSON.parse(profile.body)).toMatchObject({
      name: org.name,
      website: `${new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").protocol}//${org.subdomain}.${process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "evoly.me"}`,
      phone: "+32470123456",
      countriesOfActivity: ["BE"],
    });
    expect(JSON.parse(profile.body).email).toBeTruthy();
    expect(
      calls
        .filter((c) => c.url.pathname.includes("/methods/"))
        .map((c) => c.url.pathname.split("/").pop()),
    ).toEqual(["creditcard", "bancontact", "applepay"]);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org.id,
          action: "mollie.connected",
          actorUserId: user.id,
        },
      }),
    ).toBe(1);
  });

  it("depuis l'inscription : retour sur l'étape des paiements ; refus chez Mollie : rien n'est enregistré", async () => {
    const { org, state } = await returnFrom("onboarding");
    mollie();
    expect(
      await completeMollieConnection(
        new URLSearchParams({ error: "access_denied", state }),
      ),
    ).toBe(`/onboarding/payments?org=${org.slug}&mollie=denied`);
    expect(calls).toHaveLength(0);
    expect(
      await db.mollieAccount.count({ where: { organizationId: org.id } }),
    ).toBe(0);
  });

  it("état refusé : autre navigateur (cookie absent ou différent), autre utilisateur connecté, état périmé ou modifié", async () => {
    const { state } = await returnFrom();
    mollie();
    const nonce = jar.get("evoly_mollie")!.value;
    jar.delete("evoly_mollie");
    expect(
      await completeMollieConnection(new URLSearchParams({ code: "c", state })),
    ).toBe("/?mollie=MOLLIE_STATE_INVALID");
    jar.set("evoly_mollie", { value: "un-autre-navigateur" });
    expect(
      await completeMollieConnection(new URLSearchParams({ code: "c", state })),
    ).toBe("/?mollie=MOLLIE_STATE_INVALID");
    jar.set("evoly_mollie", { value: nonce });
    session.user = { id: "quelqu-un-d-autre", email: "x@exemple.be" };
    expect(
      await completeMollieConnection(new URLSearchParams({ code: "c", state })),
    ).toBe("/?mollie=MOLLIE_STATE_INVALID");
    expect(calls).toHaveLength(0);
  });

  it("membre qui n'a plus accès à l'organisation : refusé avant tout appel à Mollie", async () => {
    const { org, user, state } = await returnFrom();
    await db.organizationMember.updateMany({
      where: { organizationId: org.id, userId: user.id },
      data: { status: "SUSPENDED" },
    });
    mollie();
    expect(
      await completeMollieConnection(new URLSearchParams({ code: "c", state })),
    ).toBe(`/o/${org.slug}/settings/payments?mollie=FORBIDDEN`);
    expect(calls).toHaveLength(0);
  });

  it("Mollie indisponible à l'échange du code ; compte Mollie déjà relié à une autre organisation", async () => {
    const first = await returnFrom();
    mollie({
      method: "POST",
      path: "/oauth2/tokens",
      status: 500,
      body: { title: "Internal" },
    });
    expect(
      await completeMollieConnection(
        new URLSearchParams({ code: "c", state: first.state }),
      ),
    ).toBe(`/o/${first.org.slug}/settings/payments?mollie=MOLLIE_UNAVAILABLE`);
    const other = await organizer();
    const taken = `org_deja_pris_${rid()}`;
    await saveMollieAuthorization({
      organizationId: other.org.id,
      mollieOrganizationId: taken,
      tokens,
      testmode: false,
    });
    const second = await returnFrom();
    vi.unstubAllGlobals();
    mollie(
      { method: "POST", path: "/oauth2/tokens", body: tokens },
      { method: "GET", path: "/v2/organizations/me", body: { id: taken } },
    );
    expect(
      await completeMollieConnection(
        new URLSearchParams({ code: "c", state: second.state }),
      ),
    ).toBe(
      `/o/${second.org.slug}/settings/payments?mollie=MOLLIE_ACCOUNT_IN_USE`,
    );
  });
});

describe("état du compte Mollie", () => {
  const base = {
    disconnectedAt: null,
    testmode: false,
    canReceivePayments: true,
    profileId: "pfl_1",
    profileStatus: "verified",
    methods: ["bancontact"],
  };

  it("prêt à encaisser : relié, profil vérifié, inscription acceptée, un moyen de paiement actif ; en mode test, avant la vérification", () => {
    expect(mollieReady(base)).toBe(true);
    expect(mollieReady({ ...base, disconnectedAt: new Date() })).toBe(false);
    expect(mollieReady({ ...base, profileStatus: "unverified" })).toBe(false);
    expect(mollieReady({ ...base, canReceivePayments: false })).toBe(false);
    expect(mollieReady({ ...base, methods: [] })).toBe(false);
    expect(mollieReady({ ...base, profileId: null })).toBe(false);
    expect(
      mollieReady({
        ...base,
        testmode: true,
        canReceivePayments: false,
        profileStatus: "unverified",
      }),
    ).toBe(true);
    expect(
      mollieReady({ ...base, testmode: true, profileStatus: "blocked" }),
    ).toBe(false);
  });

  it("relecture : Mollie redemande des informations à un compte prêt, puis retire l'autorisation : l'organisateur est prévenu", async () => {
    const { org } = await organizer();
    const saved = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: `org_${rid()}`,
      tokens,
      testmode: false,
    });
    await db.mollieAccount.update({
      where: { id: saved.id },
      data: {
        profileId: "pfl_2",
        profileStatus: "verified",
        methods: ["bancontact"],
        onboardingStatus: "COMPLETED",
        canReceivePayments: true,
      },
    });
    mollie(
      {
        method: "GET",
        path: "/v2/onboarding/me",
        body: onboarding("needs-data"),
      },
      {
        method: "GET",
        path: "/v2/profiles/pfl_2",
        body: { id: "pfl_2", status: "verified" },
      },
      {
        method: "GET",
        path: "/v2/methods",
        body: {
          count: 1,
          _embedded: { methods: [{ id: "bancontact" }] },
          _links: { next: null },
        },
      },
    );
    const after = await syncMollieAccount(org.id);
    expect(after).toMatchObject({
      onboardingStatus: "NEEDS_DATA",
      canReceivePayments: false,
    });
    const notes = () =>
      db.notification.count({
        where: { organizationId: org.id, type: "MOLLIE_ACTION_REQUIRED" },
      });
    expect(await notes()).toBeGreaterThan(0);
    const firstCount = await notes();
    // autorisation retirée chez Mollie : renouvellement refusé, compte à relier, organisateur prévenu
    await db.mollieAccount.update({
      where: { id: saved.id },
      data: { accessTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    vi.unstubAllGlobals();
    mollie({
      method: "POST",
      path: "/oauth2/tokens",
      status: 400,
      body: { error: "invalid_grant" },
    });
    const gone = await syncMollieAccount(org.id);
    expect(gone?.disconnectedAt).not.toBeNull();
    expect(await notes()).toBeGreaterThan(firstCount);
    // ensuite, plus aucun appel ni nouvelle notification
    calls.length = 0;
    await syncMollieAccount(org.id);
    expect(calls).toHaveLength(0);
  });

  it("déconnexion par l'organisateur : autorisation révoquée chez Mollie, compte à relier, action journalisée", async () => {
    const { org, ctx } = await organizer();
    await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: `org_${rid()}`,
      tokens,
      testmode: false,
    });
    mollie({ method: "DELETE", path: "/oauth2/tokens", status: 204 });
    await disconnectMollie(ctx);
    expect(calls[0]!.method).toBe("DELETE");
    const account = await db.mollieAccount.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    expect(account.disconnectedAt).not.toBeNull();
    expect(
      await db.auditLog.count({
        where: { organizationId: org.id, action: "mollie.disconnected" },
      }),
    ).toBe(1);
    await expect(disconnectMollie(ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("tâche horaire : relit les comptes pas encore prêts, crée le profil qui manque, passe les comptes déconnectés, continue après une erreur", async () => {
    // seuls les comptes de ce test comptent : ceux des tests précédents sont mis de côté
    await db.mollieAccount.updateMany({
      where: { disconnectedAt: null },
      data: { disconnectedAt: new Date() },
    });
    const pending = await organizer();
    const broken = await organizer();
    const gone = await organizer();
    for (const o of [pending, broken, gone])
      await saveMollieAuthorization({
        organizationId: o.org.id,
        mollieOrganizationId: `org_${rid()}`,
        tokens,
        testmode: true,
      });
    await db.mollieAccount.update({
      where: { organizationId: gone.org.id },
      data: { disconnectedAt: new Date() },
    });
    // relu il y a deux jours : passe après le compte jamais relu
    const old = new Date(Date.now() - 48 * 3600_000);
    await db.mollieAccount.update({
      where: { organizationId: broken.org.id },
      data: {
        profileId: "pfl_casse",
        profileStatus: "unverified",
        syncedAt: old,
      },
    });
    mollie(
      // compte sans profil : création, moyens de paiement, puis relecture
      {
        method: "POST",
        path: "/v2/profiles",
        status: 201,
        body: { id: "pfl_tache", status: "unverified" },
      },
      {
        method: "POST",
        path: "/v2/profiles/pfl_tache/methods/creditcard",
        status: 201,
        body: {},
      },
      {
        method: "POST",
        path: "/v2/profiles/pfl_tache/methods/bancontact",
        status: 201,
        body: {},
      },
      {
        method: "POST",
        path: "/v2/profiles/pfl_tache/methods/applepay",
        status: 201,
        body: {},
      },
      {
        method: "GET",
        path: "/v2/onboarding/me",
        body: onboarding("in-review"),
      },
      {
        method: "GET",
        path: "/v2/profiles/pfl_tache",
        body: { id: "pfl_tache", status: "unverified" },
      },
      {
        method: "GET",
        path: "/v2/methods",
        body: {
          count: 1,
          _embedded: { methods: [{ id: "bancontact" }] },
          _links: { next: null },
        },
      },
      // compte en panne : Mollie répond une erreur à la relecture
      {
        method: "GET",
        path: "/v2/onboarding/me",
        status: 503,
        body: { title: "Service Unavailable" },
      },
    );
    expect(await syncMollieAccounts()).toBe(1);
    expect(
      await db.mollieAccount.findUniqueOrThrow({
        where: { organizationId: pending.org.id },
      }),
    ).toMatchObject({
      profileId: "pfl_tache",
      onboardingStatus: "IN_REVIEW",
      methods: ["bancontact"],
    });
    const b = await db.mollieAccount.findUniqueOrThrow({
      where: { organizationId: broken.org.id },
    });
    expect(b.syncedAt).toEqual(old);
    const g = await db.mollieAccount.findUniqueOrThrow({
      where: { organizationId: gone.org.id },
    });
    expect(g.syncedAt).toBeNull();
    // compte relié en mode test : testmode sur les moyens de paiement, pas sur l'inscription ni les profils
    const list = calls.find((c) => c.url.pathname === "/v2/methods")!;
    expect(list.url.searchParams.get("testmode")).toBe("true");
    for (const c of calls.filter((c) =>
      ["/v2/onboarding/me", "/v2/profiles"].includes(c.url.pathname),
    )) {
      expect(c.url.searchParams.has("testmode")).toBe(false);
      expect(c.body.includes("testmode")).toBe(false);
    }
  });
});
