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

describe("scanner hors ligne (RG-SCN-04, RG-SCN-05)", () => {
  it("billet valable : validé et mis en file ; scanné de nouveau, déjà validé", async () => {
    await open();
    net.online = false;
    await type("aaaaaa");
    expect(await title("result_VALID")).toBeTruthy();
    expect(
      screen.getByText((c) => c.includes("Léa Martin · Fosse")),
    ).toBeTruthy();
    await type("AAAAAA");
    expect(await title("result_ALREADY_USED")).toBeTruthy();
  });

  it("code inconnu : refusé ; billet annulé : son motif", async () => {
    await open();
    net.online = false;
    await type("ZZZZZZ");
    expect(await title("result_INVALID")).toBeTruthy();
    expect(screen.getByText(s.unknownOffline!)).toBeTruthy();
    await type("CCCCCC");
    expect(await title("result_VOID")).toBeTruthy();
  });

  it("serveur en erreur : la liste locale prend le relais, l'entrée n'est jamais bloquée", async () => {
    net.scan = () => json({ error: "panne" }, 500);
    await open();
    await type("AAAAAA");
    expect(await title("result_VALID")).toBeTruthy();
  });

  it("retour du réseau : la file part au serveur, puis en sort (jamais envoyée deux fois)", async () => {
    await open();
    net.online = false;
    await type("AAAAAA");
    await title("result_VALID");
    net.online = true;
    await act(async () => void window.dispatchEvent(new Event("online")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    expect(net.syncs).toHaveLength(1);
    expect(net.syncs[0]).toMatchObject({
      scans: [expect.objectContaining({ ticketId: "t1", shortCode: "AAAAAA" })],
      redemptions: [],
    });
    await act(async () => void window.dispatchEvent(new Event("online")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    expect(net.syncs).toHaveLength(1); // file vide : rien à renvoyer
  });

  it("lien expiré pendant un scan : écran dédié", async () => {
    net.scan = () => json({ error: "EXPIRED" }, 410);
    await open();
    await type("AAAAAA");
    expect(await screen.findByText(s.dead_EXPIRED!)).toBeTruthy();
  });

  it("vérification seule hors ligne : billet contrôlé sans être mis en file", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: s.modeCheck }));
    net.online = false;
    await type("AAAAAA");
    expect(await title("result_CHECKED")).toBeTruthy();
    net.online = true;
    await act(async () => void window.dispatchEvent(new Event("online")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    expect(net.syncs).toHaveLength(0); // rien n'a été validé, donc rien à envoyer
  });
});
