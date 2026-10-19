import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { SellPanel } from "@/components/scanner/SellPanel";
import { Fr } from "./intl";

const s = (fr as unknown as Record<string, Record<string, string>>).scanner!;
const sale = { currency: "EUR", ticketTypes: [{ id: "t1", name: "Entrée", priceMinor: 1_000, remaining: 10 }], options: [] };
let orders: string[] = [];
const pendingChecks = new Map<string, (r: Response) => void>();
beforeEach(() => {
  orders = ["commande-A", "commande-B"];
  pendingChecks.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Response(JSON.stringify({ orderId: orders.shift(), qrSvg: "<svg></svg>", totalMinor: 1_000, status: "PENDING" }), {
          headers: { "content-type": "application/json" },
        });
      const order = new URL(String(url), "https://x").searchParams.get("order")!;
      return new Promise<Response>((ok) => pendingChecks.set(order, ok)); // la vérification répondra plus tard
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const paid = () => new Response(JSON.stringify({ status: "PAID", tickets: 1 }), { headers: { "content-type": "application/json" } });

describe("vente sur place par QR code : le statut d'une commande ne s'applique jamais à une autre", () => {
  it("vérification de la vente A arrivée après le début de la vente B : B reste en attente de paiement", async () => {
    render(
      <Fr>
        <SellPanel token="jeton" deviceId="appareil" sale={sale} />
      </Fr>,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Entrée" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Paiement par QR code/ })));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_600))); // vérification de A lancée, sans réponse encore
    expect(pendingChecks.has("commande-A")).toBe(true);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: s.sellQrNew })));
    fireEvent.click(screen.getByRole("button", { name: "+ Entrée" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Paiement par QR code/ })));
    expect(screen.getByText(s.sellQrWaiting!)).toBeTruthy(); // vente B en attente
    await act(async () => pendingChecks.get("commande-A")!(paid())); // A payée… mais en retard
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(screen.getByText(s.sellQrWaiting!)).toBeTruthy(); // B toujours en attente : jamais « Payé » pour elle
    expect(screen.queryByText((c) => c.startsWith("Payé"))).toBeNull();
  });
});
