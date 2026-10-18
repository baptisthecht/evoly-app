import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { Countdown } from "@/components/public/Countdown";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const labels = { days: "jours", hours: "heures", minutes: "minutes", seconds: "secondes" };
const reload = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
  reload.mockReset();
  vi.stubGlobal("location", { ...window.location, reload });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const values = () => screen.getByRole("timer").querySelectorAll("span.font-display");

describe("compte à rebours de l'ouverture des ventes", () => {
  it("affiche jours, heures, minutes et secondes, puis avance chaque seconde", async () => {
    const now = new Date();
    render(<Countdown serverNow={now.toISOString()} target={new Date(now.getTime() + (86_400 + 3_600 + 60 + 5) * 1000).toISOString()} labels={labels} />);
    expect([...values()].map((v) => v.textContent)).toEqual(["01", "01", "01", "05"]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
    expect(values()[3]!.textContent).toBe("03");
  });

  it("recalé sur l'heure du serveur : un téléphone en avance d'une heure n'ouvre pas les ventes plus tôt", () => {
    const phone = new Date();
    const server = new Date(phone.getTime() - 3_600_000); // le téléphone avance d'une heure
    render(<Countdown serverNow={server.toISOString()} target={new Date(server.getTime() + 10_000).toISOString()} labels={labels} />);
    expect([...values()].map((v) => v.textContent)).toEqual(["00", "00", "00", "10"]);
  });

  it("à zéro, la page se recharge une seule fois pour afficher la vente ouverte", async () => {
    const now = new Date();
    render(<Countdown serverNow={now.toISOString()} target={new Date(now.getTime() + 1_000).toISOString()} labels={labels} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(5_000)));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("rafraîchissement de la page de commande (RG-BUY-08)", () => {
  it("rafraîchit au rythme demandé tant que le paiement n'est pas confirmé", async () => {
    render(<AutoRefresh everyMs={2_000} maxTimes={45} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(6_100)));
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });

  it("s'arrête au nombre maximal de tentatives", async () => {
    render(<AutoRefresh everyMs={1_000} maxTimes={2} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});
