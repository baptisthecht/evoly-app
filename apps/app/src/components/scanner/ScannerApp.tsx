"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraScanner } from "./CameraScanner";
import { SellPanel } from "./SellPanel";
import { AlertIcon, CheckIcon, CrossIcon } from "@/components/ui/icons";

type TicketStatus = "VALID" | "CHECKED_IN" | "VOID" | "REFUNDED";
interface LocalTicket {
  id: string;
  codeHash: string;
  shortCode: string;
  holder: string;
  buyer: string;
  emailHash: string;
  typeName: string;
  status: TicketStatus;
  checkedInAt: string | null;
  voidReason: string | null;
  orderId?: string;
}
interface Manifest {
  serverTime: string;
  salt: string;
  event: { title: string; startsAt: string; timezone: string; place: string | null };
  link: { label: string; allowManualSearch: boolean; checkOnly?: boolean; canSell?: boolean; expiresAt: string };
  sale?: { currency: string; ticketTypes: Array<{ id: string; name: string; priceMinor: number; remaining: number }> } | null;
  tickets: LocalTicket[];
  /** options de chaque commande, pour retirer au bar sans réseau (RG-OPT-05) */
  options?: Record<string, Array<{ id: string; name: string; quantity: number; redeemed: number; left: number }>>;
  /** QR codes de retrait d'options achetées sans billet (RG-OPT-03) */
  passes?: Array<{ orderId: string; codeHash: string; shortCode: string | null; holder: string }>;
  hasOptions?: boolean;
}
/** Mode « Bar et options » : ce qui reste à retirer sur le billet scanné (section 9.29). */
interface BarView {
  holder: string | null;
  options: Array<{ id: string; name: string; quantity: number; redeemed: number; left: number }>;
  error?: "NOT_FOUND" | "OFFLINE" | "FAILED";
  note?: "OFFLINE_LIST" | "QUEUED";
}
interface PendingScan {
  clientId: string;
  code?: string;
  shortCode?: string;
  ticketId?: string;
  method: "QR" | "MANUAL_CODE" | "LIST";
  scannedAt: string;
}
/** Retrait au bar fait sans réseau, envoyé à la reconnexion (RG-OPT-05). */
interface PendingRedemption {
  clientId: string;
  orderOptionId: string;
  quantity: number;
  at: string;
}
type Kind = "VALID" | "CHECKED" | "ALREADY_USED" | "VOID" | "WRONG_EVENT" | "INVALID";
interface Feedback {
  kind: Kind;
  title: string;
  detail?: string;
  offline: boolean;
}
interface ServerResult {
  result: Kind;
  ticket: { id: string; holder: string; typeName: string; status: TicketStatus; checkedInAt: string | null; voidReason: string | null } | null;
  firstScan: { at: string; gate: string | null } | null;
  otherEvent: string | null;
  error?: string;
}
type Dead = "EXPIRED" | "REVOKED" | "UNKNOWN_LINK";

const read = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as { manifest?: Manifest; pending?: PendingScan[]; redemptions?: PendingRedemption[] } | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage plein ou désactivé : le scanner continue en mémoire */
  }
};
const forget = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* rien à faire */
  }
};
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const shortOf = (s: string) => s.toUpperCase().replace(/[\s\-_.]/g, "");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let audio: AudioContext | null = null;
/** Sons de la section 9.17 : bip aigu court (valide), double bip grave (déjà scanné), bip grave (refus). */
function beep(kind: Kind) {
  try {
    audio ??= new AudioContext();
    const tones =
      kind === "VALID"
        ? [[1400, 0, 0.12]]
        : kind === "CHECKED"
          ? [
              [1100, 0, 0.07],
              [1100, 0.11, 0.07],
            ]
          : kind === "ALREADY_USED"
            ? [
                [420, 0, 0.14],
                [420, 0.22, 0.14],
              ]
            : [[300, 0, 0.35]];
    for (const [freq, delay, duration] of tones) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq!;
      gain.gain.value = 0.18;
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay!);
      osc.stop(audio.currentTime + delay! + duration!);
    }
  } catch {
    /* pas de son disponible */
  }
  navigator.vibrate?.(kind === "VALID" ? 80 : 400);
}

export function ScannerApp({ token, gone }: { token: string; gone?: Dead }) {
  const t = useTranslations("scanner");
  const locale = useLocale();
  const key = `evoly-scan:${token.slice(0, 16)}`;
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [pending, setPending] = useState<PendingScan[]>([]);
  const [redemptions, setRedemptions] = useState<PendingRedemption[]>([]);
  const [refused, setRefused] = useState(0);
  const [checkMode, setCheckMode] = useState(false); // vérification seule choisie dans le scanner
  const [barMode, setBarMode] = useState(false);
  const [bar, setBar] = useState<BarView | null>(null);
  const [online, setOnline] = useState(true);
  const [dead, setDead] = useState<Dead | null>(gone ?? null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tab, setTab] = useState<"scan" | "search" | "sell">("scan");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [emailHash, setEmailHash] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<LocalTicket | null>(null);
  // vérification seule : imposée par le lien, ou choisie ici ; le billet est contrôlé sans être validé
  const verify = !!manifest?.link.checkOnly || checkMode;
  // onglets : scan, recherche si le lien l'autorise, vente sur place si le lien l'autorise (section 9.27)
  const tabs: Array<"scan" | "search" | "sell"> = [
    "scan",
    ...(manifest?.link.allowManualSearch ? (["search"] as const) : []),
    ...(manifest?.link.canSell && manifest.sale ? (["sell"] as const) : []),
  ];
  const pendingRef = useRef(pending);
  const busy = useRef(false);
  pendingRef.current = pending;
  const redemptionsRef = useRef(redemptions);
  redemptionsRef.current = redemptions;
  const deviceId = useMemo(() => {
    try {
      const existing = localStorage.getItem("evoly-scan:device");
      if (existing) return existing;
      const id = uid();
      localStorage.setItem("evoly-scan:device", id);
      return id;
    } catch {
      return uid();
    }
  }, []);
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: manifest?.event.timezone }).format(new Date(iso));

  const kill = useCallback(
    (reason: Dead) => {
      forget(key); // RG-SCN-04 : liste effacée de l'appareil
      setManifest(null);
      setDead(reason);
    },
    [key],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/scanner/${token}/manifest`, { cache: "no-store" });
      if (res.status === 404 || res.status === 410) return kill(((await res.json().catch(() => ({}))) as { error?: Dead }).error ?? "UNKNOWN_LINK");
      if (!res.ok) throw new Error(String(res.status));
      const m = (await res.json()) as Manifest;
      const queued = new Set(pendingRef.current.map((p) => p.ticketId).filter(Boolean));
      // les scans en attente restent comptés comme passés tant qu'ils ne sont pas synchronisés
      setManifest({ ...m, tickets: m.tickets.map((tk) => (queued.has(tk.id) && tk.status === "VALID" ? { ...tk, status: "CHECKED_IN" } : tk)) });
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [token, kill]);

  const sync = useCallback(async () => {
    const queue = pendingRef.current;
    const withdrawals = redemptionsRef.current;
    if (queue.length === 0 && withdrawals.length === 0) return;
    try {
      const res = await fetch(`/api/scanner/${token}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, scans: queue, redemptions: withdrawals }),
      });
      if (res.status === 404 || res.status === 410) return kill(((await res.json().catch(() => ({}))) as { error?: Dead }).error ?? "UNKNOWN_LINK");
      if (!res.ok) throw new Error(String(res.status));
      const { results, redemptions: replayed = [] } = (await res.json()) as {
        results: Array<{ clientId: string }>;
        redemptions?: Array<{ clientId: string; refused: number }>;
      };
      const done = new Set(results.map((r) => r.clientId));
      setPending((p) => p.filter((x) => !done.has(x.clientId)));
      // retraits rejoués : ceux refusés (déjà retirés ailleurs ou remboursés) sont signalés au barman (RG-OPT-05)
      const synced = new Set(replayed.map((r) => r.clientId));
      setRedemptions((q) => q.filter((x) => !synced.has(x.clientId)));
      const nRefused = replayed.reduce((n, r) => n + r.refused, 0);
      if (nRefused > 0) setRefused((n) => n + nRefused);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [token, deviceId, kill]);

  useEffect(() => {
    if (gone) return forget(key); // RG-SCN-04 : lien expiré ou révoqué, la liste locale est effacée
    const cached = read(key);
    if (cached?.manifest) setManifest(cached.manifest);
    if (cached?.pending) setPending(cached.pending);
    if (cached?.redemptions) setRedemptions(cached.redemptions);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/scanner-sw.js", { scope: "/s/" }).catch(() => undefined);
    refresh();
    const onOnline = () => {
      setOnline(true);
      sync().then(refresh);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // RG-SCN-04 : liste rafraîchie toutes les 30 secondes, file envoyée dès que possible
    const every = setInterval(() => {
      if (navigator.onLine) sync().then(refresh);
    }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(every);
    };
  }, [key, refresh, sync, gone]);

  useEffect(() => {
    if (manifest) write(key, { manifest, pending, redemptions });
    if (manifest && new Date(manifest.link.expiresAt) <= new Date()) kill("EXPIRED");
  }, [key, manifest, pending, redemptions, kill]);

  useEffect(() => {
    let cancelled = false;
    if (manifest && query.includes("@")) sha256(`${manifest.salt}:${query.trim().toLowerCase()}`).then((h) => !cancelled && setEmailHash(h));
    else setEmailHash(null);
    return () => {
      cancelled = true;
    };
  }, [query, manifest]);

  const show = (f: Feedback) => {
    setFeedback(f);
    beep(f.kind);
    setTimeout(() => setFeedback((cur) => (cur === f ? null : cur)), 1500);
  };
  const setLocal = (id: string, status: TicketStatus, checkedInAt: string | null) =>
    setManifest((m) => (m ? { ...m, tickets: m.tickets.map((tk) => (tk.id === id ? { ...tk, status, checkedInAt } : tk)) } : m));
  const voidLabel = (reason: string | null, status: TicketStatus) => {
    const key = `void_${reason ?? (status === "REFUNDED" ? "REFUNDED" : "OTHER")}`;
    return t.has(key) ? t(key) : t("void_OTHER");
  };

  const barCall = async (body: Record<string, unknown>) => {
    if (!navigator.onLine) throw new Error("OFFLINE");
    const res = await fetch(`/api/scanner/${token}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, deviceId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error === "NOT_FOUND" ? "NOT_FOUND" : "FAILED");
    return data;
  };
  /** Sans réseau : le billet et ses options d'après la liste du téléphone, moins les retraits en attente (RG-OPT-05). */
  const localBar = async (input: { code?: string; shortCode?: string }): Promise<BarView> => {
    if (!manifest) return { holder: null, options: [], error: "OFFLINE" };
    let tk: LocalTicket | undefined;
    if (input.code) {
      const h = await sha256(`${manifest.salt}:${input.code.trim()}`);
      tk = manifest.tickets.find((x) => x.codeHash === h);
    } else if (input.shortCode) tk = manifest.tickets.find((x) => x.shortCode === shortOf(input.shortCode!));
    let orderId = tk?.orderId ?? "";
    let holder = tk?.holder ?? null;
    if (!tk) {
      // options achetées sans billet : leur QR code de retrait (RG-OPT-03)
      const h = input.code ? await sha256(`${manifest.salt}:${input.code.trim()}`) : null;
      const pass = manifest.passes?.find((x) => (h !== null && x.codeHash === h) || (!!input.shortCode && x.shortCode === shortOf(input.shortCode)));
      if (!pass) return { holder: null, options: [], error: "NOT_FOUND" };
      orderId = pass.orderId;
      holder = pass.holder;
    }
    const queued = (id: string) => redemptionsRef.current.filter((r) => r.orderOptionId === id).reduce((n, r) => n + r.quantity, 0);
    const options = (manifest.options?.[orderId] ?? []).map((o) => ({
      ...o,
      redeemed: o.redeemed + queued(o.id),
      left: Math.max(0, o.left - queued(o.id)),
    }));
    return { holder, options, note: "OFFLINE_LIST" };
  };
  const barLookup = async (input: { code?: string; shortCode?: string }) => {
    try {
      setBar(await barCall({ action: "lookup", code: input.code, shortCode: input.shortCode }));
    } catch (err) {
      const m = (err as Error).message;
      if (m === "NOT_FOUND") setBar({ holder: null, options: [], error: "NOT_FOUND" });
      else if (m === "FAILED") setBar({ holder: null, options: [], error: "FAILED" });
      else setBar(await localBar(input)); // sans réseau : la liste du téléphone
    }
  };
  /** Retrait mis en file d'attente, envoyé à la reconnexion ; le reste diminue aussitôt (RG-OPT-05). */
  const queueRedeem = (id: string) => {
    const line = bar?.options.find((o) => o.id === id);
    if (!line || line.left <= 0) return;
    setRedemptions((q) => [...q, { clientId: crypto.randomUUID(), orderOptionId: id, quantity: 1, at: new Date().toISOString() }]);
    setBar((b) =>
      b
        ? { ...b, error: undefined, note: "QUEUED", options: b.options.map((o) => (o.id === id ? { ...o, left: o.left - 1, redeemed: o.redeemed + 1 } : o)) }
        : b,
    );
    navigator.vibrate?.(60);
  };
  const barRedeem = async (id: string) => {
    if (bar?.note === "OFFLINE_LIST" || bar?.note === "QUEUED" || !navigator.onLine) return queueRedeem(id);
    try {
      const r = (await barCall({ action: "redeem", orderOptionId: id, quantity: 1 })) as { left: number };
      setBar((b) =>
        b ? { ...b, error: undefined, options: b.options.map((o) => (o.id === id ? { ...o, left: r.left, redeemed: o.quantity - r.left } : o)) } : b,
      );
      navigator.vibrate?.(60);
    } catch (err) {
      // réseau perdu pendant le retrait : mis en file d'attente ; refus du serveur : affiché
      if ((err as Error).message !== "FAILED" && (err as Error).message !== "NOT_FOUND") return queueRedeem(id);
      setBar((b) => (b ? { ...b, error: "FAILED" } : b));
    }
  };
  const scan = async (input: { code?: string; shortCode?: string; ticketId?: string; method: PendingScan["method"] }) => {
    if (busy.current || !manifest) return;
    busy.current = true;
    setTimeout(() => (busy.current = false), 1500);
    if (barMode) return barLookup(input);
    const scannedAt = new Date().toISOString();
    let local: LocalTicket | undefined;
    if (input.code) {
      const h = await sha256(`${manifest.salt}:${input.code.trim()}`);
      local = manifest.tickets.find((tk) => tk.codeHash === h);
    } else if (input.shortCode) local = manifest.tickets.find((tk) => tk.shortCode === shortOf(input.shortCode!));
    else if (input.ticketId) local = manifest.tickets.find((tk) => tk.id === input.ticketId);
    try {
      if (!navigator.onLine) throw new Error("hors ligne");
      const res = await fetch(`/api/scanner/${token}/scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, scannedAt, deviceId, verify }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 404 || res.status === 410) return kill(((await res.json().catch(() => ({}))) as { error?: Dead }).error ?? "UNKNOWN_LINK");
      if (res.status >= 500 || res.status === 429) throw new Error(String(res.status));
      const r = (await res.json()) as ServerResult;
      setOnline(true);
      if (r.error) return show({ kind: "INVALID", title: t.has(`error_${r.error}`) ? t(`error_${r.error}`) : t("result_INVALID"), offline: false });
      if (r.ticket) setLocal(r.ticket.id, r.ticket.status, r.ticket.checkedInAt);
      const detail =
        r.result === "VALID" && r.ticket
          ? `${r.ticket.holder} · ${r.ticket.typeName}${verify ? ` · ${t("notValidated")}` : ""}`
          : r.result === "ALREADY_USED" && r.firstScan
            ? t(r.firstScan.gate ? "alreadyAtGate" : "alreadyAt", { time: time(r.firstScan.at), gate: r.firstScan.gate ?? "" })
            : r.result === "VOID" && r.ticket
              ? voidLabel(r.ticket.voidReason, r.ticket.status)
              : r.result === "WRONG_EVENT"
                ? (r.otherEvent ?? undefined)
                : undefined;
      const checked = verify && r.result === "VALID";
      show({
        kind: checked ? "CHECKED" : r.result,
        title: t(checked ? "result_CHECKED" : `result_${r.result}`),
        detail: r.result === "ALREADY_USED" && r.ticket ? `${detail} · ${r.ticket.holder}` : detail,
        offline: false,
      });
    } catch {
      // RG-SCN-03 : validation locale, scan mis en file
      setOnline(false);
      const kind: Kind = !local
        ? "INVALID"
        : local.status === "VALID"
          ? verify
            ? "CHECKED"
            : "VALID"
          : local.status === "CHECKED_IN"
            ? "ALREADY_USED"
            : "VOID";
      if (kind === "VALID" && local) {
        setLocal(local.id, "CHECKED_IN", scannedAt);
        setPending((p) => [...p, { clientId: uid(), ...input, ticketId: local!.id, scannedAt }]);
      }
      const detail = local
        ? kind === "ALREADY_USED" && local.checkedInAt
          ? t("alreadyAt", { time: time(local.checkedInAt) })
          : kind === "VOID"
            ? voidLabel(local.voidReason, local.status)
            : `${local.holder} · ${local.typeName}${kind === "CHECKED" ? ` · ${t("notValidated")}` : ""}`
        : t("unknownOffline");
      show({ kind, title: t(`result_${kind}`), detail, offline: true });
    }
  };

  if (dead) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--evoly-charbon)] px-6 text-center text-[var(--evoly-creme)]">
        <div className="grid max-w-sm gap-3">
          <p className="font-display text-3xl tracking-[-0.04em]">{t(`dead_${dead}`)}</p>
          <p className="opacity-80">{t("deadBody")}</p>
        </div>
      </main>
    );
  }
  if (!manifest) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--evoly-charbon)] text-[var(--evoly-creme)]" aria-busy="true">
        <p>{online ? t("loading") : t("offlineNoData")}</p>
      </main>
    );
  }

  const live = manifest.tickets.filter((tk) => tk.status === "VALID" || tk.status === "CHECKED_IN");
  const present = live.filter((tk) => tk.status === "CHECKED_IN").length;
  const q = fold(query.trim());
  const results = manifest.link.allowManualSearch
    ? manifest.tickets
        .filter(
          (tk) =>
            !q ||
            fold(tk.holder).includes(q) ||
            fold(tk.buyer).includes(q) ||
            tk.shortCode.startsWith(shortOf(query)) ||
            (emailHash != null && tk.emailHash === emailHash),
        )
        .sort((a, b) => a.holder.localeCompare(b.holder, locale))
        .slice(0, 60)
    : [];
  const tone: Record<Kind, string> = {
    VALID: "bg-[var(--evoly-signal-ok)]",
    CHECKED: "bg-scan-checked",
    ALREADY_USED: "bg-[var(--evoly-signal-warn)]",
    VOID: "bg-[var(--evoly-signal-ko)]",
    WRONG_EVENT: "bg-[var(--evoly-signal-ko)]",
    INVALID: "bg-[var(--evoly-signal-ko)]",
  };

  return (
    <main className="min-h-dvh bg-[var(--evoly-charbon)] pb-[max(env(safe-area-inset-bottom),1rem)] text-[var(--evoly-creme)]">
      <header className="sticky top-0 z-10 grid gap-2 bg-[var(--evoly-charbon)]/95 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg tracking-[-0.03em]">{manifest.event.title}</p>
            <p className="truncate text-sm opacity-75">{manifest.link.label}</p>
            {manifest.link.checkOnly ? null : (
              <div role="group" aria-label={t("modeLabel")} className="mt-2 inline-flex rounded-full bg-[var(--evoly-creme)]/10 p-1 text-sm font-semibold">
                <button
                  type="button"
                  aria-pressed={!checkMode && !barMode}
                  onClick={() => {
                    setCheckMode(false);
                    setBarMode(false);
                  }}
                  className={`rounded-full px-3 py-1.5 ${checkMode || barMode ? "" : "bg-[var(--evoly-creme)] text-[var(--evoly-charbon)]"}`}
                >
                  {t("modeEntry")}
                </button>
                <button
                  type="button"
                  aria-pressed={checkMode}
                  onClick={() => {
                    setCheckMode(true);
                    setBarMode(false);
                  }}
                  className={`rounded-full px-3 py-1.5 ${checkMode ? "bg-[var(--evoly-creme)] text-[var(--evoly-charbon)]" : ""}`}
                >
                  {t("modeCheck")}
                </button>
                {manifest.hasOptions ? (
                  <button
                    type="button"
                    aria-pressed={barMode}
                    onClick={() => {
                      setBarMode(true);
                      setCheckMode(false);
                      setBar(null);
                    }}
                    className={`rounded-full px-3 py-1.5 ${barMode ? "bg-[var(--evoly-creme)] text-[var(--evoly-charbon)]" : ""}`}
                  >
                    {t("modeBar")}
                  </button>
                ) : null}
              </div>
            )}
            {verify && (
              <p role="status" className="mt-2 rounded-xl bg-scan-checked px-3 py-2 text-sm font-semibold text-white">
                {t("checkBanner")}
              </p>
            )}
          </div>
          <p
            role="status"
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${online ? "bg-[var(--evoly-signal-ok)] text-blanc" : "bg-[var(--evoly-signal-warn)] text-blanc"}`}
          >
            {online ? t("online") : t("offline")}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <p>
            <span className="font-display text-xl tabular-nums">{present}</span> / {live.length} {t("present")}
          </p>
          {pending.length > 0 ? <p className="rounded-full bg-blanc/15 px-3 py-1 text-xs font-semibold">{t("pending", { count: pending.length })}</p> : null}
        </div>
        {tabs.length > 1 ? (
          <nav className={`grid ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-1 rounded-full bg-blanc/10 p-1`} aria-label={t("tabs")}>
            {tabs.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`h-10 rounded-full text-sm font-semibold ${tab === k ? "bg-[var(--evoly-creme)] text-[var(--evoly-charbon)]" : ""}`}
              >
                {t(`tab_${k}`)}
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      {tab === "sell" && manifest?.sale ? <SellPanel token={token} deviceId={deviceId} sale={manifest.sale} /> : null}
      {tab === "sell" ? null : tab === "scan" ? (
        <section className="grid gap-4 px-4 pt-2">
          <CameraScanner paused={!!feedback} onCode={(value) => scan({ code: value, method: "QR" })} />
          <form
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!code.trim()) return;
              scan({ shortCode: code, method: "MANUAL_CODE" });
              setCode("");
            }}
          >
            <label className="sr-only" htmlFor="short-code">
              {t("shortCode")}
            </label>
            <input
              id="short-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("shortCode")}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-12 min-w-0 rounded-full bg-blanc px-5 font-mono text-lg tracking-[0.15em] text-[var(--evoly-charbon)] uppercase outline-none focus:ring-4 focus:ring-[var(--evoly-rose)]"
            />
            <button type="submit" className="h-12 rounded-full bg-[var(--evoly-rose)] px-5 font-semibold text-[var(--evoly-charbon)]">
              {verify ? t("check") : t("validate")}
            </button>
          </form>
        </section>
      ) : (
        <section className="grid gap-3 px-4 pt-2">
          <label className="sr-only" htmlFor="search">
            {t("searchLabel")}
          </label>
          <input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchLabel")}
            autoComplete="off"
            className="h-12 rounded-full bg-blanc px-5 text-[var(--evoly-charbon)] outline-none focus:ring-4 focus:ring-[var(--evoly-rose)]"
          />
          <ul className="grid gap-2">
            {results.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-3 rounded-2xl bg-blanc/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{tk.holder}</p>
                  <p className="truncate text-sm opacity-75">
                    {tk.typeName} · <span className="font-mono">{tk.shortCode}</span>
                  </p>
                </div>
                {tk.status === "VALID" ? (
                  <button
                    type="button"
                    onClick={() => setConfirm(tk)}
                    className="shrink-0 rounded-full bg-[var(--evoly-rose)] px-4 py-2 text-sm font-semibold text-[var(--evoly-charbon)]"
                  >
                    {t(verify ? "check" : "checkInButton")}
                  </button>
                ) : (
                  <span className="shrink-0 text-sm opacity-80">
                    {tk.status === "CHECKED_IN" ? t("alreadyShort", { time: tk.checkedInAt ? time(tk.checkedInAt) : "" }) : t("result_VOID")}
                  </span>
                )}
              </li>
            ))}
            {results.length === 0 ? <li className="py-6 text-center opacity-75">{t("noResults")}</li> : null}
          </ul>
        </section>
      )}

      {confirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-30 grid place-items-end bg-noir/60 p-4 sm:place-items-center"
        >
          <div className="grid w-full max-w-sm gap-4 rounded-[var(--r-panel)] bg-[var(--evoly-creme)] p-5 text-[var(--evoly-charbon)]">
            <p id="confirm-title" className="font-display text-xl tracking-[-0.03em]">
              {t(verify ? "checkConfirm" : "confirmTitle", { name: confirm.holder })}
            </p>
            <p className="text-sm">{t("confirmBody", { type: confirm.typeName, code: confirm.shortCode })}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="h-12 rounded-full font-semibold ring-2 ring-[var(--evoly-charbon)]">
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirm;
                  setConfirm(null);
                  scan({ ticketId: target.id, method: "LIST" });
                }}
                className="h-12 rounded-full bg-[var(--evoly-charbon)] font-semibold text-[var(--evoly-creme)]"
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {barMode ? (
        <section aria-live="polite" aria-label={t("modeBar")} className="mx-4 mb-4 grid gap-3 rounded-2xl bg-blanc p-4 text-[var(--evoly-charbon)]">
          {!bar ? <p className="text-sm">{t("barHint")}</p> : null}
          {refused > 0 ? (
            <p role="alert" className="rounded-md bg-[var(--evoly-rose)] p-2 text-sm font-semibold text-[var(--evoly-charbon)]">
              {t("barRefused", { count: refused })}
            </p>
          ) : null}
          {bar?.note ? (
            <p role="status" className="text-sm">
              {t(`bar_${bar.note}`)}
              {redemptions.length > 0 ? ` ${t("barPending", { count: redemptions.length })}` : ""}
            </p>
          ) : null}
          {bar?.holder ? <p className="font-display text-lg">{bar.holder}</p> : null}
          {bar?.error ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {t(`bar_${bar.error}`)}
            </p>
          ) : null}
          {bar && !bar.error && bar.options.length === 0 ? <p className="text-sm">{t("barEmpty")}</p> : null}
          {bar?.options.length ? (
            <ul className="grid gap-2">
              {bar.options.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3">
                  <div className="grid">
                    <span className="font-semibold">{o.name}</span>
                    <span className="text-sm tabular-nums">{t("barLeft", { left: o.left, quantity: o.quantity })}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => barRedeem(o.id)}
                    disabled={o.left === 0}
                    className="h-11 rounded-full bg-[var(--evoly-charbon)] px-4 font-semibold text-[var(--evoly-creme)] disabled:opacity-40"
                  >
                    {t("barRedeem")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {feedback ? (
        <button
          type="button"
          onClick={() => setFeedback(null)}
          role="alert"
          data-testid="scan-feedback"
          className={`fixed inset-0 z-40 grid place-items-center p-8 text-center text-blanc ${tone[feedback.kind]}`}
        >
          <span className="grid gap-3">
            <span aria-hidden="true" className="font-display text-7xl">
              {feedback.kind === "VALID" ? (
                <CheckIcon className="mx-auto" strokeWidth={3} />
              ) : feedback.kind === "ALREADY_USED" ? (
                <AlertIcon className="mx-auto" strokeWidth={3} />
              ) : (
                <CrossIcon className="mx-auto" strokeWidth={3} />
              )}
            </span>
            <span className="font-display text-3xl tracking-[-0.04em]">{feedback.title}</span>
            {feedback.detail ? <span className="text-lg">{feedback.detail}</span> : null}
            {feedback.offline ? <span className="mx-auto rounded-full bg-noir/25 px-3 py-1 text-sm">{t("offlineScan")}</span> : null}
          </span>
        </button>
      ) : null}
    </main>
  );
}
