import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { Fr } from "./intl";

// caméra simulée : un détecteur de QR codes dont le test choisit ce qu'il « voit »
let seen: string | null = null;
class FakeDetector {
  async detect() {
    return seen ? [{ rawValue: seen }] : [];
  }
}
const stop = vi.fn();

beforeEach(() => {
  seen = null;
  stop.mockReset();
  vi.useFakeTimers();
  Object.assign(window, { BarcodeDetector: FakeDetector });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn(async () => undefined) });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
});
afterEach(() => vi.useRealTimers());

const view = (onCode: (c: string) => void, paused = false) => (
  <Fr>
    <CameraScanner onCode={onCode} paused={paused} />
  </Fr>
);
const start = async () => {
  await act(async () => {
    screen.getByRole("button", { name: "Activer la caméra" }).click();
    await vi.advanceTimersByTimeAsync(0);
  });
};
const frames = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("caméra du scanner", () => {
  it("après l'allumage, chaque code lu va à la dernière fonction reçue : le mode choisi ensuite compte (bug du mode bar)", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const r = render(view(first));
    await start();
    r.rerender(view(second)); // le bénévole change de mode : l'application donne une nouvelle fonction
    seen = "CODE-BILLET";
    await frames(300);
    expect(second).toHaveBeenCalledWith("CODE-BILLET");
    expect(first).not.toHaveBeenCalled();
  });

  it("en pause, rien n'est lu ; un même code n'est pas relu avant 3 secondes, un autre l'est aussitôt", async () => {
    const onCode = vi.fn();
    const r = render(view(onCode, true));
    await start();
    seen = "A";
    await frames(500);
    expect(onCode).not.toHaveBeenCalled();
    r.rerender(view(onCode, false));
    await frames(300);
    expect(onCode).toHaveBeenCalledTimes(1);
    await frames(1000);
    expect(onCode).toHaveBeenCalledTimes(1); // le même code, encore devant la caméra
    seen = "B";
    await frames(300);
    expect(onCode).toHaveBeenLastCalledWith("B");
    await frames(3200);
    seen = "A";
    await frames(300);
    expect(onCode).toHaveBeenLastCalledWith("A");
  });

  it("caméra refusée : le bénévole est invité à saisir le code court ; la caméra s'éteint quand on quitte l'écran", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => Promise.reject(new Error("refus"))) } });
    render(view(vi.fn()));
    await start();
    expect(screen.getByText(/La caméra est bloquée/)).toBeTruthy();
  });

  it("navigateur sans caméra : message dédié", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    render(view(vi.fn()));
    await start();
    expect(screen.getByText(/ne donne pas accès à la caméra/)).toBeTruthy();
  });

  it("la caméra s'éteint quand le composant disparaît", async () => {
    const r = render(view(vi.fn()));
    await start();
    r.unmount();
    expect(stop).toHaveBeenCalled();
  });
});
