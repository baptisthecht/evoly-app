"use client";

import jsQR from "jsqr";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** Viseur : détecteur natif du navigateur si disponible, sinon décodage jsQR sur une image réduite. */
/** Formats lus : QR des billets Evoly ; codes linéaires et 2D des réseaux (Ticketmaster, Fnac, BilletReduc…). */
export const SCAN_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "pdf417",
  "aztec",
  "data_matrix",
];

let zxing: Promise<(image: ImageData) => string | null> | null = null;
/** Lecteur ZXing (licence Apache 2.0), chargé une seule fois et seulement sans détecteur du navigateur. */
function linearReader() {
  zxing ??= import("@zxing/library").then((z) => {
    const hints = new Map();
    hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [
      z.BarcodeFormat.CODE_128,
      z.BarcodeFormat.CODE_39,
      z.BarcodeFormat.CODE_93,
      z.BarcodeFormat.CODABAR,
      z.BarcodeFormat.EAN_13,
      z.BarcodeFormat.EAN_8,
      z.BarcodeFormat.ITF,
      z.BarcodeFormat.UPC_A,
      z.BarcodeFormat.UPC_E,
      z.BarcodeFormat.PDF_417,
      z.BarcodeFormat.AZTEC,
      z.BarcodeFormat.DATA_MATRIX,
    ]);
    hints.set(z.DecodeHintType.TRY_HARDER, true);
    const reader = new z.MultiFormatReader();
    reader.setHints(hints);
    return (image: ImageData) => {
      const lum = new Uint8ClampedArray(image.width * image.height);
      for (let i = 0, j = 0; j < lum.length; i += 4, j++)
        lum[j] =
          (image.data[i]! * 299 +
            image.data[i + 1]! * 587 +
            image.data[i + 2]! * 114) /
          1000;
      try {
        return reader
          .decodeWithState(
            new z.BinaryBitmap(
              new z.HybridBinarizer(
                new z.RGBLuminanceSource(lum, image.width, image.height),
              ),
            ),
          )
          .getText();
      } catch {
        return null;
      } finally {
        reader.reset();
      }
    };
  });
  return zxing;
}

export function CameraScanner({
  onCode,
  paused,
}: {
  onCode: (code: string) => void;
  paused: boolean;
}) {
  const t = useTranslations("scanner");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const last = useRef<{ value: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  const [state, setState] = useState<
    "idle" | "starting" | "on" | "denied" | "unsupported"
  >("idle");
  pausedRef.current = paused;
  // la boucle de lecture vit aussi longtemps que la caméra : elle appelle toujours la dernière fonction reçue, sinon le mode
  // choisi après l'allumage (vérification seule, bar et options) serait ignoré et le billet validé à l'entrée
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(
    () => () => stream.current?.getTracks().forEach((track) => track.stop()),
    [],
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    setState("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      const v = video.current!;
      v.srcObject = stream.current;
      await v.play();
      setState("on");
      // billets Evoly (QR) et billets des réseaux (codes linéaires, PDF417…) : seulement les formats que l'appareil sait lire
      const Native = (
        window as unknown as {
          BarcodeDetector?: DetectorCtor & {
            getSupportedFormats?: () => Promise<string[]>;
          };
        }
      ).BarcodeDetector;
      const supported = Native
        ? ((await Native.getSupportedFormats?.().catch(() => ["qr_code"])) ?? [
            "qr_code",
          ])
        : [];
      const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
      const detector =
        Native && formats.length ? new Native({ formats }) : null;
      let frame = 0;
      const tick = async () => {
        if (!stream.current) return;
        if (!pausedRef.current && v.readyState >= 2) {
          let value: string | null = null;
          try {
            if (detector)
              value = (await detector.detect(v))[0]?.rawValue ?? null;
            else {
              const c = canvas.current!;
              const scale = Math.min(1, 640 / v.videoWidth);
              c.width = Math.round(v.videoWidth * scale);
              c.height = Math.round(v.videoHeight * scale);
              const ctx = c.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const image = ctx.getImageData(0, 0, c.width, c.height);
              value =
                jsQR(image.data, c.width, c.height, {
                  inversionAttempts: "dontInvert",
                })?.data ?? null;
              // sans détecteur (iPhone) : codes-barres des réseaux lus par ZXing, chargé seulement ici, une image sur deux
              if (!value && frame++ % 2 === 0)
                value = (await linearReader())(image);
            }
          } catch {
            value = null;
          }
          const now = Date.now();
          if (
            value &&
            !(
              last.current &&
              last.current.value === value &&
              now - last.current.at < 3000
            )
          ) {
            last.current = { value, at: now };
            onCodeRef.current(value);
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
      <video
        ref={video}
        playsInline
        muted
        className={`size-full object-cover ${state === "on" ? "" : "hidden"}`}
      />
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
