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
  event: {
    title: "Gala de test",
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
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
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      calls.push({ path, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (path === "/manifest") return json(manifest(hasOptions));
      if (path === "/scan")
        return json({
          result: "VALID",
          ticket: { holder: "Léa Martin", typeName: "Table VIP" },
        });
      if (path === "/options")
        return json({
          holder: "Léa Martin",
          options: [
            {
              id: "l1",
              name: "Bouteille VIP",
              quantity: 2,
              redeemed: 0,
              refunded: 0,
              left: 2,
            },
          ],
        });
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
  await user.type(
    screen.getByPlaceholderText(fr.scanner.shortCode),
    `${code}{Enter}`,
  ); // envoyé comme au clavier
};
const called = (path: string) => calls.filter((c) => c.path === path);

beforeEach(() => {
  localStorage.clear();
  camera.onCode = undefined;
});

describe("scanner : son et vibration selon le résultat", () => {
  const tones: number[] = [];
  const vibrations: number[] = [];
  class FakeAudio {
    currentTime = 0;
    destination = {};
    createOscillator() {
      const osc = {
        frequency: { value: 0 },
        connect: (g: unknown) => g,
        start: () => tones.push(osc.frequency.value),
        stop: () => undefined,
      };
      return osc;
    }
    createGain() {
      return { gain: { value: 0 }, connect: (d: unknown) => d };
    }
    resume() {
      return Promise.resolve();
    }
  }
  const answer = (result: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).replace(/^.*\/api\/scanner\/[^/]+/, "");
        const json = (data: unknown) =>
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (path === "/manifest") return json(manifest(false));
        if (path === "/scan")
          return json({
            result,
            ticket: { holder: "Léa Martin", typeName: "Fosse" },
          });
        return json({ results: [] });
      }),
    );
  const draw = () =>
    render(
      <Fr>
        <ScannerApp token="jeton" />
      </Fr>,
    );
  beforeEach(() => {
    tones.length = 0;
    vibrations.length = 0;
    vi.stubGlobal("AudioContext", FakeAudio);
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: (ms: number) => (vibrations.push(ms), true),
    });
  });

  it("billet valable : un bip aigu court et une vibration courte (section 9.17)", async () => {
    answer("VALID");
    draw();
    await screen.findByText("Gala de test");
    await typeShortCode("ABC123");
    await waitFor(() => expect(vibrations).toEqual([80]));
    expect(tones).toEqual([1400]);
  });

  it("billet refusé : un bip grave et une vibration longue", async () => {
    answer("NOT_FOUND");
    draw();
    await screen.findByText("Gala de test");
    await typeShortCode("ABC123");
    await waitFor(() => expect(vibrations).toEqual([400]));
    expect(tones).toEqual([300]);
  });

  it("billet déjà utilisé : deux bips graves et une vibration longue", async () => {
    answer("ALREADY_USED");
    draw();
    await screen.findByText("Gala de test");
    await typeShortCode("ABC123");
    await waitFor(() => expect(vibrations).toEqual([400]));
    expect(tones).toEqual([420, 420]);
  });
});
