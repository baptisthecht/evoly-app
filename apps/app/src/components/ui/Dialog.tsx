"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

const SLIDE_MS = 260;
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const still = () =>
  typeof window === "undefined" ||
  !window.matchMedia ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(max-width: 767px)").matches;

/**
 * Fenêtre : centrée sur ordinateur, feuille qui monte du bas sur téléphone, qu'on ferme en la
 * tirant (au-delà de 120 px ou d'un geste rapide). Échap, le fond et la croix la ferment ; le
 * clavier reste à l'intérieur tant qu'elle est ouverte, puis revient sur le bouton qui l'a ouverte.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Boutons du bas (annuler, enregistrer), qui restent visibles. */
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const t = useTranslations("dialog");
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const isPhone = phone();

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      setDy(0);
      if (still()) setShown(true);
      else
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setShown(true)),
        );
      return;
    }
    setShown(false);
    const done = () => {
      setMounted(false);
      setDy(0);
      opener.current?.focus?.();
    };
    if (still()) done();
    else {
      const id = window.setTimeout(done, SLIDE_MS);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return;
    const el = panel.current;
    (
      el?.querySelector<HTMLElement>("[data-autofocus]") ??
      el?.querySelector<HTMLElement>(FOCUSABLE) ??
      el
    )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, open, onClose]);

  if (!mounted || typeof document === "undefined") return null;
  const grab = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!Number.isFinite(e.clientY)) return;
      drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current || !Number.isFinite(e.clientY)) return;
      drag.current.dy = Math.max(0, e.clientY - drag.current.y);
      setDy(drag.current.dy);
    },
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d) return;
      const speed = d.dy / Math.max(1, performance.now() - d.t);
      if (d.dy > 120 || (d.dy > 24 && speed > 0.6)) onClose();
      else setDy(0);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
      setDy(0);
    },
  };
  const motion =
    dragging || still()
      ? "none"
      : `transform ${SLIDE_MS}ms var(--motion-ease-out), opacity ${SLIDE_MS}ms ease-out`;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(34,34,34,0.45)]"
        style={{
          opacity: shown ? Math.max(0, 1 - dy / 400) : 0,
          transition:
            dragging || still() ? "none" : `opacity ${SLIDE_MS}ms ease-out`,
        }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[90dvh] w-full flex-col overflow-hidden bg-surface-raised text-ink outline-none",
          "rounded-t-[1.75rem] md:rounded-[var(--r-xl)] md:shadow-[var(--elev-lg)]",
          size === "lg" ? "md:max-w-2xl" : "md:max-w-lg",
        )}
        style={{
          transform: isPhone
            ? shown
              ? `translateY(${dy}px)`
              : "translateY(100%)"
            : shown
              ? "none"
              : "scale(0.97)",
          opacity: isPhone ? 1 : shown ? 1 : 0,
          transition: motion,
          paddingBottom: isPhone
            ? "env(safe-area-inset-bottom, 0px)"
            : undefined,
        }}
      >
        <div
          data-grab=""
          {...grab}
          className="cursor-grab touch-none pt-3 pb-1 select-none md:hidden"
        >
          <span
            aria-hidden="true"
            className="mx-auto block h-1.5 w-10 rounded-full bg-[rgba(34,34,34,0.25)]"
          />
        </div>
        <div className="flex items-start justify-between gap-4 px-5 pt-3 md:px-6 md:pt-6">
          <div className="grid gap-1">
            <h2
              id={titleId}
              className="font-display text-xl tracking-[var(--tracking-title)]"
            >
              {title}
            </h2>
            {description ? (
              <div className="text-sm text-ink-muted">{description}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="-mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 md:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
