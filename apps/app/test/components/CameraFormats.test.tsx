import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { Fr } from "./intl";

// caméra simulée : un détecteur de QR codes dont le test choisit ce qu'il « voit »
let seen: string | null = null;
let built: string[] | null = null;
class FakeDetector {
  /** formats que l'appareil sait lire, dont un format inconnu d'Evoly */
  static async getSupportedFormats() {
    return ["qr_code", "code_128", "pdf417", "ean_13", "format_inconnu"];
  }
  constructor(o?: { formats: string[] }) {
    built = o?.formats ?? null;
  }
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
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 4,
  });
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
const frames = (ms: number) =>
  act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("caméra : codes-barres des réseaux", () => {
  it("formats des réseaux demandés, seulement ceux que l'appareil sait lire ; un code-barres linéaire vu est transmis", async () => {
    const onCode = vi.fn();
    render(view(onCode));
    await start();
    expect(built).toEqual(["qr_code", "code_128", "ean_13", "pdf417"]);
    seen = "4006381333931";
    await frames(300);
    expect(onCode).toHaveBeenCalledWith("4006381333931");
  });
});
