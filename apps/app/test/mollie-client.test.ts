import { afterEach, describe, expect, it, vi } from "vitest";

process.env.MOLLIE_CLIENT_ID = "app_essai_evoly";
process.env.MOLLIE_CLIENT_SECRET = "secret_essai_evoly";

const {
  MOLLIE_SCOPES,
  MollieError,
  fromMollieAmount,
  mollieApi,
  mollieConnectConfigured,
  mollieLocale,
  oauthAuthorizeUrl,
  oauthRevoke,
  oauthTokens,
  toMollieAmount,
} = await import("@/lib/mollie");

type Seen = { url: URL; method: string; headers: Headers; body: string };
const seen: Seen[] = [];

/** Remplace fetch : chaque appel est noté, Mollie répond par le statut et le corps donnés. */
function mollieReplies(status: number, body?: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      seen.push({
        url: new URL(String(url)),
        method: init.method ?? "GET",
        headers: new Headers(init.headers),
        body: typeof init.body === "string" ? init.body : "",
      });
      return new Response(
        body === undefined
          ? null
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
        { status },
      );
    }),
  );
}

afterEach(() => {
  seen.length = 0;
  vi.unstubAllGlobals();
});

describe("client Mollie : montants", () => {
  it("centimes vers le texte décimal de Mollie, et retour, sans nombre à virgule", () => {
    expect(toMollieAmount(0, "eur")).toEqual({
      currency: "EUR",
      value: "0.00",
    });
    expect(toMollieAmount(5, "EUR").value).toBe("0.05");
    expect(toMollieAmount(1234, "EUR").value).toBe("12.34");
    expect(toMollieAmount(-250, "EUR").value).toBe("-2.50");
    expect(() => toMollieAmount(12.5, "EUR")).toThrow();
    expect(fromMollieAmount({ currency: "EUR", value: "12.34" })).toBe(1234);
    expect(fromMollieAmount({ currency: "EUR", value: "12.3" })).toBe(1230);
    expect(fromMollieAmount({ currency: "EUR", value: "12" })).toBe(1200);
    expect(fromMollieAmount({ currency: "EUR", value: "-0.05" })).toBe(-5);
    expect(() =>
      fromMollieAmount({ currency: "EUR", value: "1,50" }),
    ).toThrow();
    for (const minor of [1, 99, 100, 101, 4990, 123456789])
      expect(fromMollieAmount(toMollieAmount(minor, "EUR"))).toBe(minor);
  });

  it("langue des pages Mollie selon la langue et le pays de l'organisation", () => {
    expect(mollieLocale("fr", "BE")).toBe("fr_BE");
    expect(mollieLocale("nl", "BE")).toBe("nl_BE");
    expect(mollieLocale("fr", "CH")).toBe("fr_FR");
    expect(mollieLocale("de", "CH")).toBe("de_CH");
    expect(mollieLocale("en", "GB")).toBe("en_GB");
    expect(mollieLocale("en", "BE")).toBe("en_US");
    expect(mollieLocale("pt", null)).toBe("pt_PT");
    expect(mollieLocale("xx", "BE")).toBe("en_US");
  });
});

describe("client Mollie : appels à l'API", () => {
  it("jeton en Bearer ; mode test dans l'adresse d'un GET et d'un DELETE, dans le corps d'un POST et d'un PATCH", async () => {
    mollieReplies(200, { id: "tr_1" });
    const api = mollieApi("access_essai", true);
    await api("/payments/tr_1", { query: { embed: "refunds" } });
    await api("/payments", {
      body: { description: "Concert" },
      idempotencyKey: "order:1:payment:1",
    });
    await api("/payments/tr_1", {
      method: "PATCH",
      body: { description: "x" },
    });
    await api("/payments/tr_1", { method: "DELETE" });
    const [get, post, patch, del] = seen;
    expect(get!.method).toBe("GET");
    expect(get!.url.pathname).toBe("/v2/payments/tr_1");
    expect(get!.url.searchParams.get("testmode")).toBe("true");
    expect(get!.url.searchParams.get("embed")).toBe("refunds");
    expect(get!.headers.get("authorization")).toBe("Bearer access_essai");
    expect(get!.body).toBe("");
    expect(post!.method).toBe("POST");
    expect(JSON.parse(post!.body)).toEqual({
      description: "Concert",
      testmode: true,
    });
    expect(post!.url.searchParams.has("testmode")).toBe(false);
    expect(post!.headers.get("idempotency-key")).toBe("order:1:payment:1");
    expect(post!.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(patch!.body)).toEqual({
      description: "x",
      testmode: true,
    });
    expect(del!.method).toBe("DELETE");
    expect(del!.url.searchParams.get("testmode")).toBe("true");
  });

  it("hors mode test (clé d'Evoly), rien n'est ajouté ; 204 sans contenu", async () => {
    mollieReplies(204);
    const api = mollieApi("live_cle_evoly");
    expect(await api("/payments/tr_1", { method: "DELETE" })).toBeUndefined();
    await api("/customers", { body: { name: "Asso" } });
    expect(seen[0]!.url.searchParams.has("testmode")).toBe(false);
    expect(JSON.parse(seen[1]!.body)).toEqual({ name: "Asso" });
    expect(seen[1]!.headers.has("idempotency-key")).toBe(false);
  });

  it("erreur de Mollie : statut, titre, détail et champ en cause ; réponse illisible gardée en détail", async () => {
    mollieReplies(422, {
      status: 422,
      title: "Unprocessable Entity",
      detail: "The amount is lower than the minimum",
      field: "amount",
    });
    const err = await mollieApi("t")("/payments", { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(MollieError);
    expect(err).toMatchObject({
      status: 422,
      title: "Unprocessable Entity",
      detail: "The amount is lower than the minimum",
      field: "amount",
    });
    vi.unstubAllGlobals();
    mollieReplies(502, "<html>Bad gateway</html>");
    const bad = await mollieApi("t")("/payments/tr_1").catch((e) => e);
    expect(bad).toMatchObject({
      status: 502,
      detail: "<html>Bad gateway</html>",
    });
  });
});

describe("client Mollie : OAuth (Mollie Connect)", () => {
  it("page d'autorisation : application, tous les droits d'emblée, adresse de retour, création ou connexion, langue", () => {
    expect(mollieConnectConfigured()).toBe(true);
    const url = new URL(
      oauthAuthorizeUrl({
        state: "etat-signe",
        redirectUri: "https://app.evoly.me/api/mollie/oauth",
        signup: true,
        locale: "fr_BE",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://my.mollie.com/oauth2/authorize",
    );
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("app_essai_evoly");
    expect(p.get("scope")).toBe(MOLLIE_SCOPES.join(" "));
    expect(p.get("scope")).toContain("payments.write");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("approval_prompt")).toBe("auto");
    expect(p.get("redirect_uri")).toBe("https://app.evoly.me/api/mollie/oauth");
    expect(p.get("state")).toBe("etat-signe");
    expect(p.get("landing_page")).toBe("signup");
    expect(p.get("locale")).toBe("fr_BE");
    const login = new URL(
      oauthAuthorizeUrl({
        state: "s",
        redirectUri: "https://x",
        signup: false,
      }),
    );
    expect(login.searchParams.get("landing_page")).toBe("login");
    expect(login.searchParams.has("locale")).toBe(false);
  });

  it("échange du code puis renouvellement : identifiants de l'application en Basic, formulaire encodé", async () => {
    const tokens = {
      access_token: "access_1",
      refresh_token: "refresh_1",
      expires_in: 3600,
      token_type: "bearer",
      scope: MOLLIE_SCOPES.join(" "),
    };
    mollieReplies(200, tokens);
    expect(
      await oauthTokens({ code: "auth_code", redirectUri: "https://x/cb" }),
    ).toEqual(tokens);
    await oauthTokens({ refreshToken: "refresh_1" });
    const [code, refresh] = seen;
    expect(code!.url.toString()).toBe("https://api.mollie.com/oauth2/tokens");
    expect(code!.method).toBe("POST");
    expect(code!.headers.get("authorization")).toBe(
      `Basic ${Buffer.from("app_essai_evoly:secret_essai_evoly").toString("base64")}`,
    );
    expect(code!.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(Object.fromEntries(new URLSearchParams(code!.body))).toEqual({
      grant_type: "authorization_code",
      code: "auth_code",
      redirect_uri: "https://x/cb",
    });
    expect(Object.fromEntries(new URLSearchParams(refresh!.body))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh_1",
    });
  });

  it("autorisation retirée : code OAuth invalid_grant ; révocation en DELETE, refusée si Mollie répond une erreur", async () => {
    mollieReplies(400, {
      error: "invalid_grant",
      error_description: "The refresh token is invalid",
    });
    const err = await oauthTokens({ refreshToken: "revoque" }).catch((e) => e);
    expect(err).toBeInstanceOf(MollieError);
    expect(err).toMatchObject({ status: 400, code: "invalid_grant" });
    vi.unstubAllGlobals();
    seen.length = 0;
    mollieReplies(204);
    await oauthRevoke("refresh_1", "refresh_token");
    expect(seen[0]!.method).toBe("DELETE");
    expect(Object.fromEntries(new URLSearchParams(seen[0]!.body))).toEqual({
      token_type_hint: "refresh_token",
      token: "refresh_1",
    });
    vi.unstubAllGlobals();
    mollieReplies(401, {
      status: 401,
      title: "Unauthorized Request",
      detail: "",
    });
    await expect(oauthRevoke("x", "access_token")).rejects.toBeInstanceOf(
      MollieError,
    );
  });
});
