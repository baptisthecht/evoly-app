"use client";

import jsQR from "jsqr";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** Viseur : détecteur natif du navigateur si disponible, sinon décodage jsQR sur une image réduite. */
export function CameraScanner({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const t = useTranslations("scanner");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const last = useRef<{ value: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  const [state, setState] = useState<"idle" | "starting" | "on" | "denied" | "unsupported">("idle");
  pausedRef.current = paused;

  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    setState("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      const v = video.current!;
      v.srcObject = stream.current;
      await v.play();
      setState("on");
      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      const tick = async () => {
        if (!stream.current) return;
        if (!pausedRef.current && v.readyState >= 2) {
          let value: string | null = null;
          try {
            if (detector) value = (await detector.detect(v))[0]?.rawValue ?? null;
            else {
              const c = canvas.current!;
              const scale = Math.min(1, 640 / v.videoWidth);
              c.width = Math.round(v.videoWidth * scale);
              c.height = Math.round(v.videoHeight * scale);
              const ctx = c.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, 0, 0, c.width, c.height);
              value = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {
            value = null;
          }
          const now = Date.now();
          if (value && !(last.current && last.current.value === value && now - last.current.at < 3000)) {
            last.current = { value, at: now };
            onCode(value);
          }
        }
        setTimeout(tick, 140);
      };
      tick();
    } catch {
      setState("denied");
    }
  };

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--r-panel)] bg-noir">
      <video ref={video} playsInline muted className={`size-full object-cover ${state === "on" ? "" : "hidden"}`} />
      <canvas ref={canvas} className="hidden" />
      {state === "on" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[14%] rounded-3xl border-4 border-[var(--evoly-rose)] shadow-[0_0_0_999px_rgba(0,0,0,0.35)]"
        />
      ) : null}
      {state !== "on" ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="grid gap-3">
            {state === "denied" ? (
              <p className="text-sm">{t("cameraDenied")}</p>
            ) : state === "unsupported" ? (
              <p className="text-sm">{t("cameraUnsupported")}</p>
            ) : null}
            <button
              type="button"
              onClick={start}
              disabled={state === "starting"}
              className="rounded-full bg-[var(--evoly-rose)] px-6 py-3 font-semibold text-[var(--evoly-charbon)]"
            >
              {state === "starting" ? t("cameraStarting") : t("cameraStart")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
