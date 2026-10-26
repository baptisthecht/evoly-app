import { createHash } from "node:crypto";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ScannerApp } from "@/components/scanner/ScannerApp";
import { Fr } from "./intl";

vi.mock("@/components/scanner/CameraScanner", () => ({
  CameraScanner: () => null,
}));
const s = (fr as unknown as Record<string, Record<string, string>>).scanner!;
const hash = (code: string) =>
  createHash("sha256").update(`sel:${code}`).digest("hex");
const ticket = (
  id: string,
  shortCode: string,
  over: Record<string, unknown> = {},
) => ({
  id,
  codeHash: hash(`CODE-${id}`),
  shortCode,
  holder: "Léa Martin",
  buyer: "Léa Martin",
  emailHash: "",
  typeName: "Fosse",
  status: "VALID",
  checkedInAt: null,
  voidReason: null,
  ...over,
});
const manifest = () => ({
  serverTime: new Date().toISOString(),
  salt: "sel",
  event: {
    title: "Gala hors ligne",
    startsAt: new Date().toISOString(),
    timezone: "Europe/Brussels",
    place: null,
  },
  link: {
    label: "Porte A",
    allowManualSearch: true,
    checkOnly: false,
    canSell: false,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  },
  sale: null,
  tickets: [
    ticket("t1", "AAAAAA"),
    ticket("t2", "BBBBBB", {
      status: "CHECKED_IN",
      checkedInAt: new Date().toISOString(),
    }),
    ticket("t3", "CCCCCC", { status: "VOID", voidReason: "REFUNDED" }),
    // réservation BilletReduc de 2 places sur un même code (billets importés)
    ticket("x:e1", "", {
      codeHash: hash("BR-77812"),
      groupHash: hash("BR-77812"),
      network: "BilletReduc",
      holder: "Durand",
      buyer: "BilletReduc",
      typeName: "Plein tarif",
    }),
    ticket("x:e2", "", {
      codeHash: hash("BR-77812#2"),
      groupHash: hash("BR-77812"),
      network: "BilletReduc",
      holder: "Durand",
      buyer: "BilletReduc",
      typeName: "Plein tarif",
    }),
  ],
  options: {},
  passes: [],
  hasOptions: false,
});
const net = {
  online: true,
  scan: (_b: Record<string, unknown>): Response =>
    json({
      result: "VALID",
      ticket: {
        id: "t1",
        status: "CHECKED_IN",
        holder: "Léa Martin",
        typeName: "Fosse",
      },
    }),
  syncs: [] as Array<Record<string, unknown>>,
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  localStorage.clear();
  net.online = true;
  net.syncs = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => net.online);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/api\/scanner\/[^/]+/, "");
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      if (path === "/manifest") return json(manifest());
      if (path === "/scan") return net.scan(body);
      if (path === "/sync") {
        net.syncs.push(body);
        return json({
          results: (body.scans as Array<{ clientId: string }>).map((x) => ({
            clientId: x.clientId,
          })),
          redemptions: [],
        });
      }
      return json({});
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const open = async () => {
  render(
    <Fr>
      <ScannerApp token="jeton" />
    </Fr>,
  );
  await screen.findByText("Gala hors ligne");
};
const type = async (code: string) => {
  await act(async () => void (await vi.advanceTimersByTimeAsync(1_600))); // un scan à la fois
  const input = screen.getByPlaceholderText(s.shortCode!) as HTMLInputElement;
  fireEvent.change(input, { target: { value: code } });
  await act(async () => void fireEvent.submit(input.closest("form")!));
};
const title = (k: string) => screen.findByText(s[k]!);

// douchette dans son propre fichier : enchaînée après des scans hors connexion simulés (horloges simulées des tests),
// elle ne voyait plus ses scans ; lancée seule, elle passe (aucun état de l'application ne survit d'un scanner à l'autre)
describe("scanner : mode lecteur (Zebra, Honeywell, douchette)", () => {
  // requêtes réellement envoyées au serveur pour un scan
  const sentScans = () =>
    (
      fetch as unknown as { mock: { calls: Array<[string, RequestInit?]> } }
    ).mock.calls
      .filter((c) => String(c[0]).endsWith("/scan"))
      .map((c) => JSON.parse(String(c[1]?.body)) as Record<string, unknown>);
  const field = () => screen.getByLabelText(s.readerField!) as HTMLInputElement;
  const readerOn = async () => {
    await open();
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_600)));
    fireEvent.click(screen.getByRole("button", { name: s.readerMode }));
  };

  it("choix « Lecteur » mémorisé par appareil ; la caméra cède la place au panneau « Prêt »", async () => {
    await readerOn();
    expect(screen.getByText(s.readerReady!)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: s.readerMode })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(localStorage.getItem("evoly-scan:reader")).toBe("1");
    expect(field().getAttribute("inputmode")).toBe("none"); // le clavier du téléphone ne s'ouvre pas
  });

  it("code reçu d'un bloc dans le champ du lecteur : scan envoyé après la pause", async () => {
    await readerOn();
    fireEvent.input(field(), { target: { value: "4006381333931" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(150)));
    await vi.waitFor(
      () =>
        expect(sentScans().at(-1)).toMatchObject({
          code: "4006381333931",
          method: "QR",
        }),
      { timeout: 5_000, interval: 50 },
    );
  });

  it("« Tester mon lecteur » : le code reçu, sa façon d'arriver et sa fin s'affichent, sans être scanné", async () => {
    await readerOn();
    fireEvent.click(screen.getByRole("button", { name: s.readerTest }));
    const before = sentScans().length;
    fireEvent.input(field(), { target: { value: "TM-998877" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(await screen.findByText("Reçu : TM-998877")).toBeTruthy();
    expect(
      screen.getByText((c) => c.startsWith("d’un bloc, fin : Entrée")),
    ).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(sentScans().length).toBe(before);
  });
});
