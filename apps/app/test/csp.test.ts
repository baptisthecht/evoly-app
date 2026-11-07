import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsp } from "@/lib/csp";

/** Sources d'une directive de la CSP (« form-action 'self' https://… » → ["'self'", "https://…"]). */
const sources = (csp: string, directive: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${directive} `))!
    .split(" ")
    .slice(1);

const REDIRECTS = [
  "https://checkout.stripe.com",
  "https://billing.stripe.com",
  "https://connect.stripe.com",
  "https://accounts.google.com",
  "https://appleid.apple.com",
];

describe("politique de sécurité du contenu, destinations des formulaires (CDC section 13)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("l'app, le scanner et les sites où une action serveur redirige : un formulaire envoyé avant le chargement du JavaScript n'y est pas bloqué (US-SCN-06)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.evoly.me");
    vi.stubEnv("NEXT_PUBLIC_BASE_DOMAIN", "evoly.me");
    expect(sources(buildCsp(), "form-action")).toEqual([
      "'self'",
      "https://scanner.evoly.me",
      ...REDIRECTS,
    ]);
  });

  it("le scanner garde le protocole et le port de l'app (développement, CI)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3001");
    vi.stubEnv("NEXT_PUBLIC_BASE_DOMAIN", "localhost:3001");
    expect(sources(buildCsp(), "form-action")).toContain(
      "http://scanner.localhost:3001",
    );
  });

  it("sans adresse de l'app valide, aucune origine de scanner inventée", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_DOMAIN", "evoly.me");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(sources(buildCsp(), "form-action")).toEqual([
      "'self'",
      ...REDIRECTS,
    ]);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "pas une adresse");
    expect(sources(buildCsp(), "form-action")).toEqual([
      "'self'",
      ...REDIRECTS,
    ]);
  });
});
