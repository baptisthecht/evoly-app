import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { ScannerApp } from "@/components/scanner/ScannerApp";
import { Fr } from "./intl";

// la caméra est remplacée par une doublure qui garde la dernière fonction reçue, comme la vraie
const camera: { onCode?: (code: string) => void } = {};
vi.mock("@/components/scanner/CameraScanner", () => ({
  CameraScanner: (p: { onCode: (code: string) => void }) => {
    camera.onCode = p.onCode;
    return null;
  },
}));

const manifest = (hasOptions: boolean) => ({
  serverTime: new Date().toISOString(),
  salt: "sel",
  event: { title: "Gala de test", startsAt: new Date(Date.now() + 3_600_000).toISOString(), timezone: "Europe/Brussels", place: null },
  link: { label: "Porte A", allowManualSearch: true, checkOnly: false, canSell: false, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  sale: null,
  tickets: [],
  options: {},
  passes: [],
  hasOptions,
});

// un serveur simulé qui note chaque appel
let calls: Array<{ path: string; body: Record<string, unknown> | null }> = [];
const serve = (hasOptions = true) => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/api\/scanner\/[^/]+/, "");
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ path, body });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (path === "/manifest") return json(manifest(hasOptions));
      if (path === "/scan") return json({ result: "VALID", ticket: { holder: "Léa Martin", typeName: "Table VIP" } });
      if (path === "/options")
        return json({ holder: "Léa Martin", options: [{ id: "l1", name: "Bouteille VIP", quantity: 2, redeemed: 0, refunded: 0, left: 2 }] });
      return json({ results: [] });
    }),
  );
};
const open = async () => {
  render(
    <Fr>
      <ScannerApp token="jeton" />
    </Fr>,
  );
  await screen.findByText("Gala de test");
};
const typeShortCode = async (code: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(fr.scanner.shortCode), `${code}{Enter}`); // envoyé comme au clavier
};
const called = (path: string) => calls.filter((c) => c.path === path);

beforeEach(() => {
  localStorage.clear();
  camera.onCode = undefined;
});

describe("application du scanner : chaque mode appelle le bon service", () => {
  it("entrée : le billet est validé à l'entrée", async () => {
    serve();
    await open();
    await typeShortCode("ABC123");
    await screen.findByText(fr.scanner.result_VALID);
    expect(called("/scan").map((c) => c.body?.verify)).toEqual([false]);
    expect(called("/options")).toEqual([]);
  });

  it("vérification : le billet est contrôlé sans être validé, jamais au bar", async () => {
    serve();
    await open();
    await userEvent.setup().click(screen.getByRole("button", { name: fr.scanner.modeCheck }));
    expect(screen.getByRole("button", { name: fr.scanner.check })).toBeTruthy(); // le bouton annonce une vérification
    await typeShortCode("ABC123");
    await screen.findByText(fr.scanner.result_CHECKED);
    expect(called("/scan").map((c) => c.body?.verify)).toEqual([true]);
    expect(called("/options")).toEqual([]);
  });

  it("bar et options : les options du billet sont cherchées, l'entrée n'est jamais validée", async () => {
    serve();
    await open();
    await userEvent.setup().click(screen.getByRole("button", { name: fr.scanner.modeBar }));
    await typeShortCode("ABC123");
    await screen.findByText(/Bouteille VIP/);
    expect(called("/options")).toHaveLength(1);
    expect(called("/scan")).toEqual([]);
  });

  it("sans option dans l'événement, le mode bar n'est pas proposé", async () => {
    serve(false);
    await open();
    expect(screen.queryByRole("button", { name: fr.scanner.modeBar })).toBeNull();
    expect(screen.getByRole("button", { name: fr.scanner.modeCheck })).toBeTruthy();
  });

  it("le bug du 18 octobre : caméra allumée, puis mode bar choisi ; le code lu par la caméra va au bar, pas à l'entrée", async () => {
    serve();
    await open();
    const atStart = camera.onCode!; // la fonction reçue par la caméra à l'allumage, en mode entrée
    await userEvent.setup().click(screen.getByRole("button", { name: fr.scanner.modeBar }));
    expect(camera.onCode).not.toBe(atStart); // la caméra reçoit une nouvelle fonction, celle du mode bar
    await act(async () => camera.onCode!("CODE-DU-BILLET"));
    await waitFor(() => expect(called("/options")).toHaveLength(1));
    expect(called("/options")[0]!.body).toMatchObject({ code: "CODE-DU-BILLET" });
    expect(called("/scan")).toEqual([]);
  });
});
