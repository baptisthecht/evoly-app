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
let reply: (body: Record<string, unknown>) => Response = () =>
  new Response("{}", { status: 500 });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
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
const plus = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  n: number,
) => {
  for (let i = 0; i < n; i++)
    await user.click(screen.getByRole("button", { name: `+ ${name}` }));
};
const cash = () => screen.getByRole("button", { name: /Encaisser/ });

describe("vente sur place : hors ligne, réseau coupé, retrait d'un billet, e-mail du client", () => {
  const s = (fr as unknown as Record<string, Record<string, string>>).scanner!;
  const offline = (value: boolean) =>
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => !value,
    });
  afterEach(() => offline(false));

  it("hors ligne : la vente est refusée avec le bon message, rien n'est envoyé", async () => {
    const user = userEvent.setup();
    draw();
    await plus(user, "Entrée", 1);
    offline(true);
    await user.click(cash());
    expect(await screen.findByText(s.sellOffline!)).toBeTruthy();
    expect(posts).toHaveLength(0);
  });

  it("réseau coupé pendant la vente : une erreur s'affiche", async () => {
    reply = () => {
      throw new TypeError("Failed to fetch");
    };
    const user = userEvent.setup();
    draw();
    await plus(user, "Entrée", 1);
    await user.click(cash());
    expect(await screen.findByText(s.sellError!)).toBeTruthy();
  });

  it("« − » retire un billet ; l'e-mail du client part avec la vente, nettoyé", async () => {
    reply = () => json({ tickets: 1 });
    const user = userEvent.setup();
    draw();
    await plus(user, "Entrée", 2);
    await user.click(screen.getByRole("button", { name: "− Entrée" }));
    await user.type(
      screen.getByRole("textbox", { name: s.sellEmail }),
      "  client@exemple.be ",
    );
    await user.click(cash());
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      action: "cash",
      email: "client@exemple.be",
    });
    expect(JSON.stringify(posts[0]!.lines)).toContain('"quantity":1');
  });
});
