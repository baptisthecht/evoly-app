"use client";

import { useEffect, useState } from "react";

/**
 * « Installer l'application » : invitation du navigateur quand elle existe (Chrome, Edge, Android) ; sur iPhone et iPad,
 * où Safari n'en propose pas, la marche à suivre. Masqué quand l'app est déjà installée ou que rien n'est possible.
 */
export function InstallAppButton({ label, iosHint }: { label: string; iosHint: string }) {
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const update = () => setMode(window.__evolyInstall ? "prompt" : ios ? "ios" : "hidden");
    update();
    window.addEventListener("evoly:installable", update);
    return () => window.removeEventListener("evoly:installable", update);
  }, []);

  if (mode === "hidden") return null;
  const onClick = async () => {
    if (mode === "ios") return setHint((h) => !h);
    const prompt = window.__evolyInstall;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    window.__evolyInstall = null;
    setMode("hidden");
  };
  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={mode === "ios" ? hint : undefined}
        className="h-10 w-full rounded-full px-4 text-left text-sm font-semibold whitespace-nowrap text-creme/80 hover:bg-blanc/10 hover:text-creme"
      >
        {label}
      </button>
      {hint && <p className="px-4 text-xs text-creme/70">{iosHint}</p>}
    </div>
  );
}
