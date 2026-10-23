import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmbedBook, EmbedHeight } from "@/components/public/Embed";
import { embedEventFor } from "@/server/embed";
import { loadPublicEvent } from "@/server/publicEvents";
import { eventPublicUrl } from "@/server/urls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Billetterie",
  robots: { index: false, follow: false },
};

/** Module de billetterie intégrable (section 9.26, Pro) : l'événement et ses tarifs ; l'achat s'ouvre dans une fenêtre de paiement. */
export default async function EmbedModule({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const t = await getTranslations("public");
  const allowed = await embedEventFor(eventId.slice(0, 40));
  const data = allowed ? await loadPublicEvent({ id: allowed.id }) : null;
  if (!allowed || !data) {
    return (
      <main className="bg-surface p-4 text-ink">
        <EmbedHeight />
        <p>{t("embedUnavailable")}</p>
      </main>
    );
  }
  const locale = (await getLocale()) as Locale;
  const e = data.event;
  const money = (v: number) =>
    v === 0
      ? t("free")
      : formatMoney(v, e.currency, locale, { trimZeroCents: true });
  const place = [e.locationName, e.city].filter(Boolean).join(", ");
  return (
    <main className="grid gap-4 bg-surface p-4 text-ink">
      <EmbedHeight />
      <header className="grid gap-1">
        <h1 className="font-display text-2xl tracking-[-0.03em]">{e.title}</h1>
        <p className="text-sm text-ink-muted">
          {formatDateTime(e.startsAt, e.timezone, locale)}
          {place ? ` · ${place}` : ""}
        </p>
      </header>
      {data.ticketTypes.length ? (
        <ul className="grid gap-2">
          {data.ticketTypes.map((tt) => (
            <li
              key={tt.id}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-surface-raised px-4 py-3 ring-1 ring-line"
            >
              <span className="font-semibold">{tt.name}</span>
              <span className="text-right text-sm tabular-nums">
                {money(tt.priceMinor)}
                {tt.remaining <= 0 ? (
                  <span className="block text-ink-muted">{t("soldOut")}</span>
                ) : tt.remaining <= 10 ? (
                  <span className="block text-warning">
                    {t("fewLeft", { count: tt.remaining })}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <EmbedBook
        url={eventPublicUrl(allowed.organization, e)}
        label={
          e.buttonLabel?.trim() ||
          allowed.organization.brand?.buttonLabel?.trim() ||
          t("embedBook")
        }
      />
    </main>
  );
}
