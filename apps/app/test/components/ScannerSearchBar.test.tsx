import { createHash } from "node:crypto";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ScannerApp } from "@/components/scanner/ScannerApp";
import { Fr } from "./intl";

vi.mock("@/components/scanner/CameraScanner", () => ({ CameraScanner: () => null }));
const s = (fr as unknown as Record<string, Record<string, string>>).scanner!;
const sha = (v: string) => createHash("sha256").update(`sel:${v}`).digest("hex");
const ticket = (id: string, holder: string, shortCode: string, email: string, over: Record<string, unknown> = {}) => ({
  id,
  codeHash: sha(`CODE-${id}`),
  shortCode,
  holder,
  buyer: holder,
  emailHash: sha(email),
  typeName: "Fosse",
  status: "VALID",
  checkedInAt: null,
  voidReason: null,
  orderId: `ord-${id}`,
  ...over,
});
const manifest = (search = true) => ({
  serverTime: new Date().toISOString(),
  salt: "sel",
  event: { title: "Gala du bar", startsAt: new Date().toISOString(), timezone: "Europe/Brussels", place: null },
  link: { label: "Bar", allowManualSearch: search, checkOnly: false, canSell: false, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  sale: null,
  tickets: [ticket("t1", "Élodie Dupré", "AAAAAA", "elodie@exemple.be"), ticket("t2", "Tom Dubois", "BBBBBB", "tom@exemple.be")],
  options: { "ord-t1": [{ id: "oo1", name: "Boisson", quantity: 2, redeemed: 0, left: 2 }] },
  passes: [],
  hasOptions: true,
});
const net = { online: true, search: true, scans: [] as Array<Record<string, unknown>>, syncs: [] as Array<Record<string, unknown>> };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  localStorage.clear();
  Object.assign(net, { online: true, search: true, scans: [], syncs: [] });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => net.online);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/api\/scanner\/[^/]+/, "");
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path === "/manifest") return json(manifest(net.search));
      if (path === "/scan")
        return (net.scans.push(body), json({ result: "VALID", ticket: { id: "t1", status: "CHECKED_IN", holder: "Élodie Dupré", typeName: "Fosse" } }));
      if (path === "/sync")
        return (
          net.syncs.push(body),
          json({
            results: [],
            redemptions: (body.redemptions as Array<{ clientId: string }>).map((r, i) => ({ clientId: r.clientId, refused: i === 0 ? 1 : 0 })),
          })
        );
      return json({ error: "FAILED" }, 500);
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
  await screen.findByText("Gala du bar");
};
const search = (q: string) => {
  fireEvent.click(screen.getByText(s.tab_search!).closest("button")!);
  fireEvent.change(screen.getByPlaceholderText(s.searchLabel!), { target: { value: q } });
};
const names = () => screen.queryAllByRole("listitem").map((li) => li.textContent ?? "");

describe("scanner : recherche d'un participant (RG-SCN-03)", () => {
  it("par nom, sans tenir compte des accents ni des majuscules ; validation confirmée, puis envoyée", async () => {
    await open();
    search("elodie dupre");
    await waitFor(() => expect(names().some((n) => n.includes("Élodie Dupré"))).toBe(true));
    expect(names().some((n) => n.includes("Tom Dubois"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: s.checkInButton }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: s.confirm })));
    await waitFor(() => expect(net.scans[0]).toMatchObject({ ticketId: "t1", method: "LIST" }));
  });

  it("par e-mail : comparé à son empreinte salée, l'adresse n'est jamais sur le téléphone ; par code court ; aucun résultat", async () => {
    await open();
    expect(JSON.stringify(localStorage)).not.toContain("tom@exemple.be");
    search("TOM@exemple.be");
    await waitFor(() => expect(names().some((n) => n.includes("Tom Dubois"))).toBe(true));
    search("aaa");
    await waitFor(() => expect(names().some((n) => n.includes("Élodie Dupré"))).toBe(true));
    search("personne");
    await waitFor(() => expect(screen.getByText(s.noResults!)).toBeTruthy());
  });

  it("lien sans recherche manuelle : pas d'onglet de recherche", async () => {
    net.search = false;
    await open();
    expect(screen.queryByText(s.tab_search!)).toBeNull();
    expect(screen.getByText("Gala du bar")).toBeTruthy(); // l'écran est bien chargé : l'absence est réelle (un seul onglet : pas de barre)
  });
});

describe("scanner : bar et options sans réseau (RG-OPT-05)", () => {
  const scanAtBar = async (code: string) => {
    fireEvent.click(screen.getByRole("button", { name: s.modeBar }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(1_600)));
    const input = screen.getByPlaceholderText(s.shortCode!) as HTMLInputElement;
    fireEvent.change(input, { target: { value: code } });
    await act(async () => void fireEvent.submit(input.closest("form")!));
  };
  it("options d'après la liste du téléphone ; retrait mis en file, le reste diminue aussitôt, jamais en dessous de zéro", async () => {
    await open();
    net.online = false;
    await scanAtBar("AAAAAA");
    expect(await screen.findByText((c) => c.startsWith(s.bar_OFFLINE_LIST!.slice(0, 20)))).toBeTruthy();
    const redeem = () => screen.getByRole("button", { name: s.barRedeem });
    for (let i = 0; i < 3; i++) await act(async () => void fireEvent.click(redeem()));
    expect(screen.getByText((c) => c === s.barLeft!.replace("{left}", "0").replace("{quantity}", "2"))).toBeTruthy();
    expect(screen.getByText((c) => c.includes("2") && /attente/.test(c))).toBeTruthy(); // deux retraits en attente, pas trois
  });

  it("retour du réseau : retraits rejoués, ceux refusés signalés au barman", async () => {
    await open();
    net.online = false;
    await scanAtBar("AAAAAA");
    await screen.findByText((c) => c.startsWith(s.bar_OFFLINE_LIST!.slice(0, 20)));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: s.barRedeem })));
    net.online = true;
    await act(async () => void window.dispatchEvent(new Event("online")));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    expect(net.syncs[0]).toMatchObject({ redemptions: [expect.objectContaining({ orderOptionId: "oo1", quantity: 1 })] });
    expect(await screen.findByText((c) => c.includes("1") && /refus/.test(c))).toBeTruthy();
  });
});
