import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaRegister } from "@/components/pwa/PwaRegister";

const media = (standalone: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: standalone && q.includes("standalone"), media: q, addEventListener() {}, removeEventListener() {} }));
let register: ReturnType<typeof vi.fn>;
beforeEach(() => {
  register = vi.fn(async () => ({}));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
  window.__evolyInstall = undefined;
  media(false);
});
afterEach(() => vi.unstubAllGlobals());
const viewport = () => document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content;
const prompt = () =>
  Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: async () => undefined,
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });

describe("application installable", () => {
  it("service worker enregistré pour toute l'application ; un refus n'empêche rien", async () => {
    register.mockRejectedValueOnce(new Error("refusé"));
    render(<PwaRegister />);
    expect(register).toHaveBeenCalledWith("/app-sw.js", { scope: "/" });
  });

  it("invitation à installer : gardée pour le bouton du menu, sans bandeau automatique", () => {
    const notified = vi.fn();
    window.addEventListener("evoly:installable", notified);
    render(<PwaRegister />);
    const e = prompt();
    window.dispatchEvent(e);
    expect([e.defaultPrevented, window.__evolyInstall === e, notified.mock.calls.length]).toEqual([true, true, 1]);
    window.removeEventListener("evoly:installable", notified);
  });

  it("application installée : l'invitation est oubliée et le bouton prévenu", () => {
    const notified = vi.fn();
    window.addEventListener("evoly:installable", notified);
    render(<PwaRegister />);
    window.dispatchEvent(prompt());
    window.dispatchEvent(new Event("appinstalled"));
    expect([window.__evolyInstall, notified.mock.calls.length]).toEqual([null, 2]);
    window.removeEventListener("evoly:installable", notified);
  });

  it("dans l'application installée : zoom à deux doigts bloqué ; dans le navigateur : permis", () => {
    const a = render(<PwaRegister />);
    expect(viewport()).not.toContain("user-scalable");
    a.unmount();
    media(true);
    render(<PwaRegister />);
    expect(viewport()).toContain("maximum-scale=1, user-scalable=no");
    const gesture = new Event("gesturestart", { cancelable: true });
    document.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(true);
  });

  it("démontage : plus aucune écoute", () => {
    media(true);
    const r = render(<PwaRegister />);
    r.unmount();
    const e = prompt();
    window.dispatchEvent(e);
    const gesture = new Event("gesturestart", { cancelable: true });
    document.dispatchEvent(gesture);
    expect([e.defaultPrevented, gesture.defaultPrevented]).toEqual([false, false]);
  });
});
