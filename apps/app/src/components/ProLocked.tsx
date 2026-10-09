import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

export type LockedFeature = "SEATING_MAPS" | "EMAIL_MARKETING" | "PRESALE_CODES";

/**
 * Fonction Pro montrée en offre gratuite : nom, bénéfice, aperçu grisé et non interactif, et accès à l'abonnement
 * (ou invitation à demander au propriétaire). Une fonction cachée ne se découvre pas ; une fonction grisée se vend.
 */
export async function ProLocked({
  orgSlug,
  feature,
  canUpgrade,
  preview,
}: {
  orgSlug: string;
  feature: LockedFeature;
  canUpgrade: boolean;
  preview?: ReactNode;
}) {
  const t = await getTranslations("proLocked");
  const id = `pro-${feature.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-[var(--r-card)] border border-dashed border-line-strong bg-surface-raised p-5">
      <div className="flex flex-wrap items-center gap-2">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <h2 id={id} className="font-display text-xl tracking-[var(--tracking-title)]">
          {t(`${feature}.title`)}
        </h2>
        <span className="rounded-full bg-lilas px-2 py-0.5 font-label text-xs font-bold text-charbon">{t("badge")}</span>
      </div>
      <p className="-mt-2 text-ink-muted">{t(`${feature}.body`)}</p>
      {preview ? (
        <div inert className="pointer-events-none select-none opacity-50 grayscale" aria-hidden="true">
          {preview}
        </div>
      ) : null}
      {canUpgrade ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/o/${orgSlug}/billing`}
            className="inline-flex min-h-11 items-center rounded-full bg-surface-inverse px-5 font-label font-bold text-ink-inverse"
          >
            {t("cta")}
          </Link>
          <span className="text-sm text-ink-muted">{t("trial")}</span>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("askOwner")}</p>
      )}
    </section>
  );
}

/** Aperçu du plan de salle pour l'offre gratuite : quelques rangs en arc face à la scène. */
export function SeatingPreview() {
  const rows = [7, 8, 9, 10, 11];
  const seats: Array<{ x: number; y: number; fill: string }> = [];
  rows.forEach((n, i) => {
    const r = 120 + i * 18;
    for (let k = -n; k <= n; k++) {
      if (k === 0) continue;
      const a = k * (12 / r);
      seats.push({ x: 240 + r * Math.sin(a), y: -70 + r * Math.cos(a), fill: i < 2 ? "#FFB8E8" : i < 4 ? "#D9B8F0" : "#A9C4F2" });
    }
  });
  return (
    <svg viewBox="0 0 480 170" className="h-auto w-full max-w-xl" aria-hidden="true">
      <rect x="170" y="6" width="140" height="22" rx="7" fill="#222222" />
      {seats.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r="5" fill={s.fill} />
      ))}
    </svg>
  );
}
