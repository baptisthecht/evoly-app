import { createHash } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ScannerApp } from "@/components/scanner/ScannerApp";
import { Fr } from "./intl";

vi.mock("@/components/scanner/CameraScanner", () => ({
  CameraScanner: () => null,
}));
const s = (fr as unknown as Record<string, Record<string, string>>).scanner!;
const sha = (v: string) =>
  createHash("sha256").update(`sel:${v}`).digest("hex");
const ticket = (
  id: string,
  holder: string,
  shortCode: string,
  email: string,
  over: Record<string, unknown> = {},
) => ({
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
  event: {
    title: "Gala du bar",
    startsAt: new Date().toISOString(),
    timezone: "Europe/Brussels",
    place: null,
  },
  link: {
    label: "Bar",
    allowManualSearch: search,
    checkOnly: false,
    canSell: false,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  },
  sale: null,
  tickets: [
    // déjà entrée : au bar, c'est le cas de presque tout le monde
    ticket("t1", "Élodie Dupré", "AAAAAA", "elodie@exemple.be", {
      status: "CHECKED_IN",
      checkedInAt: "2027-04-17T19:05:00.000Z",
    }),
    ticket("t2", "Tom Dubois", "BBBBBB", "tom@exemple.be"),
    // billet vendu par la Fnac, importé : jamais d'option
    ticket("x:e1", "Nina Durand", "", "", {
      codeHash: sha("FNAC-1"),
      emailHash: "",
      orderId: null,
      network: "Fnac",
    }),
  ],
  options: {
    "ord-t1": [
      { id: "oo1", name: "Boisson", quantity: 2, redeemed: 0, left: 2 },
    ],
  },
  passes: [],
  hasOptions: true,
});
const net = {
  online: true,
  search: true,
  scans: [] as Array<Record<string, unknown>>,
  syncs: [] as Array<Record<string, unknown>>,
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  localStorage.clear();
  Object.assign(net, { online: true, search: true, scans: [], syncs: [] });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => net.online);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/api\/scanner\/[^/]+/, "");
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      if (path === "/manifest") return json(manifest(net.search));
      if (path === "/scan")
        return (
          net.scans.push(body),
          json({
            result: "VALID",
            ticket: {
              id: "t1",
              status: "CHECKED_IN",
              holder: "Élodie Dupré",
              typeName: "Fosse",
            },
          })
        );
      if (path === "/sync")
        return (
          net.syncs.push(body),
          json({
            results: [],
            redemptions: (body.redemptions as Array<{ clientId: string }>).map(
              (r, i) => ({ clientId: r.clientId, refused: i === 0 ? 1 : 0 }),
            ),
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
  fireEvent.change(screen.getByPlaceholderText(s.searchLabel!), {
    target: { value: q },
  });
};
const names = () =>
  screen.queryAllByRole("listitem").map((li) => li.textContent ?? "");

describe("scanner : recherche au bar et options", () => {
  const atBar = () =>
    fireEvent.click(screen.getByRole("button", { name: s.modeBar }));

  it("personne déjà entrée : « Voir les options », ouvertes sans confirmation", async () => {
    await open();
    net.online = false;
    atBar();
    search("elodie");
    const show = await screen.findByRole("button", { name: s.barOpen });
    expect(screen.queryByRole("button", { name: s.checkInButton })).toBeNull();
    await act(async () => void fireEvent.click(show));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    expect(screen.queryByRole("dialog")).toBeNull(); // aucune « Faire entrer Élodie ? »
    expect(await screen.findByText((c) => c.includes("Boisson"))).toBeTruthy();
  });

  it("billet importé d'un réseau : « Sans option », sans bouton", async () => {
    await open();
    atBar();
    search("durand");
    expect(await screen.findByText(s.barNoOptions!)).toBeTruthy();
    expect(screen.queryByRole("button", { name: s.barOpen })).toBeNull();
    expect(screen.queryByRole("button", { name: s.checkInButton })).toBeNull();
  });

  it("à l'entrée, rien ne change : déjà entrée, pas de bouton ; pas encore entré, « Faire entrer »", async () => {
    await open();
    search("elodie");
    expect(
      await screen.findByText((c) =>
        c.startsWith(s.alreadyShort!.split("{")[0]!),
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: s.checkInButton })).toBeNull();
    search("tom");
    expect(
      await screen.findByRole("button", { name: s.checkInButton }),
    ).toBeTruthy();
  });
});
