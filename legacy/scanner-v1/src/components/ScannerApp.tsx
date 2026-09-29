"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useOfflineQueue, ScanResult } from "@/hooks/useOfflineQueue";

interface EventStats {
  stats: { total: number; checkedIn: number; rate: number };
  recentCheckIns: { id: string; name: string; checkedInAt?: string }[];
}

interface Props {
  token: string;
  label: string;
  event: { id: string; title: string; startsAt: string };
}

export function ScannerApp({ token, label, event }: Props) {
  const [mode, setMode] = useState<"scan" | "manual" | "list" | "stats">("scan");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [stats, setStats] = useState<EventStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resultTimeout = useRef<NodeJS.Timeout | null>(null);
  const wasOfflineRef = useRef(false);

  const { pendingCount, addToQueue, flushQueue, refreshQueue } = useOfflineQueue();

  // Network status + auto-flush on reconnect
  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      if (wasOfflineRef.current) {
        flushQueue((result) => showResult(result));
      }
      wasOfflineRef.current = false;
    };
    const onOffline = () => {
      setIsOffline(true);
      wasOfflineRef.current = true;
    };
    setIsOffline(!navigator.onLine);
    wasOfflineRef.current = !navigator.onLine;
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushQueue]);

  // Refresh queue count on mount
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/event?token=${token}`);
      if (res.ok) setStats(await res.json());
    } catch {
      // Silent fail — network status indicator covers this
    }
  }, [token]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Camera
  useEffect(() => {
    if (mode !== "scan") {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        startDecoding();
      }
    } catch {
      setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
  }

  function stopCamera() {
    setScanning(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // QR decoding via zxing-wasm
  async function startDecoding() {
    try {
      const decode = async () => {
        if (!videoRef.current || !scanning) return;
        try {
          const { readBarcodes } = await import("zxing-wasm/reader");

          const canvas = document.createElement("canvas");
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(videoRef.current, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const results = await readBarcodes(imageData, {
            formats: ["QRCode"],
          });
          if (results.length > 0 && results[0].text) {
            await processQR(results[0].text);
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch {}
        if (scanning) requestAnimationFrame(decode);
      };
      requestAnimationFrame(decode);
    } catch {
      setCameraError("Décodeur QR non disponible. Utilisez la saisie manuelle.");
    }
  }

  async function processQR(qrCode: string) {
    await scan(qrCode);
  }

  async function scan(qrCode: string) {
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: qrCode.trim(), token }),
      });
      const data: ScanResult = await res.json();
      showResult(data);
      triggerHaptic(data.result);
      loadStats();
    } catch {
      setIsOffline(true);
      wasOfflineRef.current = true;
      await addToQueue(qrCode.trim(), token);
      showResult({
        result: "QUEUED",
        message: "Scan mis en file d'attente",
      });
      triggerHaptic("INVALID");
    }
  }

  function showResult(result: ScanResult) {
    if (resultTimeout.current) clearTimeout(resultTimeout.current);
    setLastResult(result);
    resultTimeout.current = setTimeout(() => setLastResult(null), 3000);
  }

  function triggerHaptic(result: string) {
    if (!("vibrate" in navigator)) return;
    if (result === "VALID") navigator.vibrate(100);
    else if (result === "ALREADY_SCANNED") navigator.vibrate([200, 100, 200]);
    else navigator.vibrate(500);
  }

  function handleManualSubmit() {
    if (!manualCode.trim()) return;
    scan(manualCode.trim());
    setManualCode("");
    setMode("scan");
  }

  async function handleRetryFlush() {
    setLastResult(null);
    await flushQueue((result) => showResult(result));
    loadStats();
  }

  const resultColors: Record<string, string> = {
    VALID: "bg-green-500",
    ALREADY_SCANNED: "bg-amber-500",
    INVALID: "bg-red-500",
    WRONG_EVENT: "bg-red-500",
    INVALID_SCANNER: "bg-red-900",
    QUEUED: "bg-gray-800",
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-black overflow-hidden select-none">
      {/* Offline banner */}
      {isOffline && (
        <div className="flex-shrink-0 bg-amber-500 text-black text-xs font-semibold text-center py-1 px-4 z-30">
          Hors ligne — les scans ne seront pas enregistrés
        </div>
      )}

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-safe-top pt-4 pb-2 flex items-center justify-between bg-black/80 backdrop-blur-sm z-20">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 truncate">{label}</p>
          <p className="text-sm font-semibold text-white truncate">{event.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {/* Offline queue badge */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={handleRetryFlush}
              className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {pendingCount} en attente
            </button>
          )}
          {stats && (
            <button
              type="button"
              onClick={() => setMode(mode === "stats" ? "scan" : "stats")}
              className="flex flex-col items-center bg-white/10 rounded-xl px-3 py-1.5"
            >
              <span className="text-lg font-bold text-white leading-none">{stats.stats.checkedIn}</span>
              <span className="text-xs text-gray-400">/ {stats.stats.total}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Camera viewfinder */}
        {mode === "scan" && (
          <div className="absolute inset-0">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-64">
                <div className="absolute inset-0 border-2 border-white/20 rounded-2xl" />
                {/* Corner markers */}
                {[
                  "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                  "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-violet-400 ${cls}`} />
                ))}
                {/* Scan line animation */}
                <div className="absolute left-2 right-2 h-0.5 bg-violet-400/60 animate-scan" style={{
                  animation: "scan 2s ease-in-out infinite",
                }} />
              </div>
            </div>

            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
                <div className="text-center space-y-3">
                  <p className="text-red-400 text-sm">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => { setMode("manual"); }}
                    className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg"
                  >
                    Saisie manuelle
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats panel */}
        {mode === "stats" && stats && (
          <div className="absolute inset-0 bg-gray-950 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Progress */}
              <div className="bg-gray-900 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-3xl font-bold text-white">{stats.stats.checkedIn}</p>
                    <p className="text-gray-400 text-sm">présents sur {stats.stats.total}</p>
                  </div>
                  <p className="text-2xl font-bold text-violet-400">{stats.stats.rate}%</p>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${stats.stats.rate}%` }}
                  />
                </div>
              </div>

              {/* Recent check-ins */}
              <div className="bg-gray-900 rounded-2xl overflow-hidden">
                <p className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-800">
                  Derniers scans
                </p>
                {stats.recentCheckIns.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-500">Aucun scan pour l&apos;instant</p>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {stats.recentCheckIns.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-4 py-3">
                        <p className="text-sm text-white">{c.name}</p>
                        <p className="text-xs text-gray-500">
                          {c.checkedInAt ? new Date(c.checkedInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Manual entry */}
        {mode === "manual" && (
          <div className="absolute inset-0 bg-gray-950 flex flex-col items-center justify-center p-6 space-y-4">
            <p className="text-white font-semibold">Saisie manuelle</p>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              placeholder="Code QR ou numéro de billet"
              autoFocus
              className="w-full max-w-sm px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-violet-500"
            />
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              className="w-full max-w-sm py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold rounded-xl"
            >
              Valider
            </button>
          </div>
        )}

        {/* Scan result overlay */}
        {lastResult && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 transition-all ${resultColors[lastResult.result] ?? "bg-gray-800"} bg-opacity-95`}>
            <div className="text-center space-y-3">
              <div className="text-6xl">
                {lastResult.result === "VALID" ? "✅" :
                  lastResult.result === "ALREADY_SCANNED" ? "⚠️" :
                  lastResult.result === "QUEUED" ? "🕐" : "❌"}
              </div>
              <p className="text-2xl font-bold text-white">{lastResult.message}</p>
              {lastResult.ticket?.holderName && (
                <p className="text-white/80 text-lg">{lastResult.ticket.holderName}</p>
              )}
              {lastResult.ticket?.checkedInAt && (
                <p className="text-white/60 text-sm">
                  Scanné à {new Date(lastResult.ticket.checkedInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {lastResult.result === "QUEUED" && (
                <button
                  type="button"
                  onClick={handleRetryFlush}
                  className="mt-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-xl border border-white/30"
                >
                  Réessayer maintenant
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div className="flex-shrink-0 bg-gray-950 border-t border-gray-800 pb-safe-bottom">
        <div className="flex">
          {[
            { id: "scan" as const, icon: "📷", label: "Scanner" },
            { id: "manual" as const, icon: "⌨️", label: "Manuel" },
            { id: "stats" as const, icon: "📊", label: "Stats" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                mode === tab.id ? "text-violet-400" : "text-gray-500"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes scan {
          0% { top: 8px; }
          50% { top: calc(100% - 8px); }
          100% { top: 8px; }
        }
      `}</style>
    </div>
  );
}
