import {
  CONSENT_COOKIE,
  EVENT_COOKIE,
  parseAcquisition,
  parseConsent,
  SOURCE_COOKIE,
} from "@evoly/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { openConsent } from "@/components/tracking/cookies";
import { Fr } from "./intl";

const nav = vi.hoisted(() => ({ path: "/register" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
const t = (fr as unknown as Record<string, Record<string, string>>).consent!;
const cookie = (name: string) =>
  document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? null;
const clearCookies = () =>
  document.cookie
    .split(";")
    .forEach(
      (c) =>
        (document.cookie = `${c.split("=")[0]!.trim()}=; Max-Age=0; Path=/`),
    );
beforeEach(() => {
  clearCookies();
  nav.path = "/register";
  delete window.gtag;
  delete window.dataLayer;
  document.getElementById("evoly-gtag")?.remove();
  window.history.pushState({}, "", "/register");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
/** Les identifiants de Google sont lus au chargement du module : configurés avant l'import. */
async function load(env: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  return (await import("@/components/tracking/Tracking")).Tracking;
}
const calls = () =>
  (window.dataLayer ?? []).map((a) => Array.from(a as IArguments));

describe("bandeau de consentement (RGPD, ePrivacy)", () => {
  it("tout refuser : refus enregistré, le bandeau se ferme", async () => {
    const Tracking = await load();
    render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: t.refuse }));
    expect(parseConsent(cookie(CONSENT_COOKIE))).toMatchObject({
      analytics: false,
      ads: false,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("personnaliser : rien coché d'avance, seul ce qui est coché est accepté ; le bandeau se rouvre depuis « Gérer les cookies »", async () => {
    const Tracking = await load();
    render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: t.customize }));
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, false, false]); // nécessaires seulement
    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    expect(parseConsent(cookie(CONSENT_COOKIE))).toMatchObject({
      analytics: true,
      ads: false,
    });
    act(() => openConsent());
    expect(
      (screen.getAllByRole("checkbox") as HTMLInputElement[]).map(
        (b) => b.checked,
      ),
    ).toEqual([true, true, false]);
  });

  it("choix déjà fait : pas de bandeau ; billetterie intégrée et scanner : rien du tout", async () => {
    const Tracking = await load();
    const a = render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: t.accept }));
    a.unmount();
    render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    clearCookies();
    for (const path of ["/integre/club/gala", "/scanner", "/acces-scanner/x"]) {
      nav.path = path;
      const r = render(
        <Fr>
          <Tracking />
        </Fr>,
      );
      expect(r.container.innerHTML).toBe("");
      r.unmount();
    }
  });
});

describe("Google en mode Consentement v2, source des visites, événements confirmés", () => {
  it("sans choix : tout refusé par défaut, Google chargé seulement si configuré", async () => {
    const Off = await load();
    const a = render(
      <Fr>
        <Off />
      </Fr>,
    );
    expect(document.getElementById("evoly-gtag")).toBeNull();
    a.unmount();
    const On = await load({ NEXT_PUBLIC_GA_ID: "G-TEST123" });
    render(
      <Fr>
        <On />
      </Fr>,
    );
    expect(calls()[0]).toEqual([
      "consent",
      "default",
      {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        wait_for_update: 500,
      },
    ]);
    expect(
      document.getElementById("evoly-gtag")!.getAttribute("src"),
    ).toContain("id=G-TEST123");
    fireEvent.click(screen.getByRole("button", { name: t.accept }));
    expect(calls().at(-1)).toEqual([
      "consent",
      "update",
      {
        analytics_storage: "granted",
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      },
    ]);
  });

  it("source de la première visite : seulement avec consentement ; identifiant de clic seulement avec la publicité", async () => {
    window.history.pushState(
      {},
      "",
      "/register?utm_source=google&utm_medium=cpc&gclid=Cj0abc",
    );
    const Tracking = await load();
    const consent = (analytics: boolean, ads: boolean) =>
      (document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 1, analytics, ads, at: "x" }))}; Path=/`);
    const a = render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    expect(cookie(SOURCE_COOKIE)).toBeNull(); // aucun choix : aucun cookie de mesure
    a.unmount();
    consent(true, false);
    const b = render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    expect(parseAcquisition(cookie(SOURCE_COOKIE))).toMatchObject({
      source: "google",
      medium: "cpc",
    });
    expect(parseAcquisition(cookie(SOURCE_COOKIE))!.gclid).toBeUndefined();
    b.unmount();
    document.cookie = `${SOURCE_COOKIE}=; Max-Age=0; Path=/`;
    consent(true, true);
    const c = render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    expect(parseAcquisition(cookie(SOURCE_COOKIE))!.gclid).toBe("Cj0abc");
    c.unmount();
    consent(true, false); // publicité retirée : identifiant effacé
    const d = render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    expect(parseAcquisition(cookie(SOURCE_COOKIE))!.gclid).toBeUndefined();
    d.unmount();
    consent(false, false); // tout refusé : source effacée
    render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    expect(cookie(SOURCE_COOKIE)).toBeNull();
  });

  it("événements confirmés par le serveur : envoyés une fois avec leur conversion Google Ads, puis effacés", async () => {
    document.cookie = `${EVENT_COOKIE}=sign_up; Path=/`;
    const Tracking = await load({
      NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-123",
      NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "abcLabel",
    });
    render(
      <Fr>
        <Tracking />
      </Fr>,
    );
    const sent = calls().filter((c) => c[0] === "event");
    expect(sent).toEqual([
      ["event", "sign_up"],
      ["event", "conversion", { send_to: "AW-123/abcLabel" }],
    ]);
    expect(cookie(EVENT_COOKIE)).toBeNull();
  });
});
