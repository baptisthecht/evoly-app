import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SellPanel } from "@/components/scanner/SellPanel";
import { Fr } from "./intl";

const sale = {
  currency: "EUR",
  ticketTypes: [{ id: "t1", name: "Entrée", priceMinor: 1_000, remaining: 5 }],
  options: [{ id: "o1", name: "Vestiaire", priceMinor: 200, left: 1 }],
};
let posts: Array<Record<string, unknown>> = [];
let reply: (body: Record<string, unknown>) => Response = () => new Response("{}", { status: 500 });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(body);
        return reply(body);
      }
      return json({ status: "PAID", tickets: 2 }); // vérification du paiement par QR code
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const draw = () =>
  render(
    <Fr>
      <SellPanel token="jeton" deviceId="appareil-1" sale={sale} />
    </Fr>,
  );
const plus = async (user: ReturnType<typeof userEvent.setup>, name: string, n: number) => {
  for (let i = 0; i < n; i++) await user.click(screen.getByRole("button", { name: `+ ${name}` }));
};
const cash = () => screen.getByRole("button", { name: /Encaisser/ });

describe("vente sur place (scanner)", () => {
  it("espèces : quantités envoyées, vente confirmée, stock restant diminué (impossible de vendre au-delà)", async () => {
    reply = () => json({ tickets: 2 });
    draw();
    const user = userEvent.setup();
    await plus(user, "Entrée", 2);
    expect(cash().textContent).toMatch(/20/);
    await user.click(cash());
    await screen.findByText("Vente enregistrée : 2 billets, entrée validée.");
    expect(posts).toEqual([expect.objectContaining({ action: "cash", lines: [{ ticketTypeId: "t1", quantity: 2 }], options: [], deviceId: "appareil-1" })]);
    await plus(user, "Entrée", 5); // il n'en reste que 3
    expect(cash().textContent).toMatch(/30/);
  });

  it("une option ne dépasse jamais son stock ; vendue seule, elle donne un code de retrait", async () => {
    reply = () => json({ tickets: 0, optionsShortCode: "VX7K2" });
    draw();
    const user = userEvent.setup();
    await plus(user, "Vestiaire", 3); // une seule disponible
    expect(cash().textContent).toMatch(/2/);
    await user.click(cash());
    await screen.findByText(fr.scanner.sellPassCode);
    expect(screen.getByText("VX7K2")).toBeTruthy();
    expect(screen.getByText(fr.scanner.sellDoneOptions)).toBeTruthy();
    expect(posts[0]).toMatchObject({ lines: [], options: [{ optionId: "o1", quantity: 1 }] });
  });

  it("panier vide : les deux encaissements sont désactivés, rien n'est envoyé", async () => {
    draw();
    expect((cash() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Paiement par QR code/ }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(cash());
    expect(posts).toEqual([]);
  });

  it("sans réseau : message, rien n'est encaissé", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    draw();
    const user = userEvent.setup();
    await plus(user, "Entrée", 1);
    await user.click(cash());
    expect(screen.getByText(fr.scanner.sellOffline)).toBeTruthy();
    expect(posts).toEqual([]);
    vi.restoreAllMocks();
  });

  it("refus du serveur : message, le stock affiché ne bouge pas", async () => {
    reply = () => json({ error: "NOT_ENOUGH_STOCK" }, 409);
    draw();
    const user = userEvent.setup();
    await plus(user, "Entrée", 5);
    await user.click(cash());
    await screen.findByText(fr.scanner.sellError);
    await plus(user, "Entrée", 1);
    expect(cash().textContent).toMatch(/50/); // toujours 5 au maximum
  });

  it("paiement par QR code : le code s'affiche, puis la vente est confirmée quand le paiement arrive", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      reply = () => json({ orderId: "commande-1", qrSvg: "<svg></svg>", totalMinor: 2_000, status: "PENDING" });
      draw();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await plus(user, "Entrée", 2);
      await user.click(screen.getByRole("button", { name: /Paiement par QR code/ }));
      await screen.findByText(fr.scanner.sellQrWaiting);
      expect(posts[0]).toMatchObject({ lines: [{ ticketTypeId: "t1", quantity: 2 }] });
      await act(async () => void (await vi.advanceTimersByTimeAsync(2_600)));
      await waitFor(() => expect(screen.getByText("Payé : 2 billets, entrée validée.")).toBeTruthy());
    } finally {
      vi.useRealTimers();
    }
  });
});
