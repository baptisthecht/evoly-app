import { formatDate, formatMoney, formatTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { existsSync } from "node:fs";
import { palette } from "@evoly/ui";
import { join } from "node:path";
import { appleCredentials } from "@/server/wallet/apple";
import { googleCredentials } from "@/server/wallet/google";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { HolderEditor } from "@/components/public/HolderEditor";
import { ResaleControl } from "@/components/public/ResaleControl";
import { RefundRequest } from "@/components/public/RefundRequest";
import { checkRefundRequest } from "@evoly/core";
import { resaleQuote, resaleShortUrl } from "@/server/resale";
import { db } from "@/lib/db";
import { PublicShell } from "@/components/public/PublicShell";
import { buttonClass } from "@/components/ui/Button";
import { findOrderIdByToken } from "@/server/checkout";
import { getBuyerOrder, syncPaymentFromStripe } from "@/server/orders";
import { getPublicOrganization } from "@/server/publicEvents";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders");
  // page personnelle : jamais indexée, et le jeton ne fuit pas vers les liens sortants
  return { title: t("ticketsTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Page des billets, ouverte par le lien magique (section 9.12, RG-POST-01). */
export default async function BuyerTicketsPage({ params }: { params: Promise<{ sub: string; token: string }> }) {
  const { sub, token } = await params;
  if ((await siteGate(sub, `/billets/${token}`)).kind === "DISABLED") notFound();
  const org = await getPublicOrganization(sub);
  const orderId = await findOrderIdByToken(token);
  if (!org || !orderId) notFound();
  let order = await getBuyerOrder(orderId);
  if (order.organizationId !== org.id) notFound();
  if (order.status === "PENDING" && order.stripePaymentIntentId) {
    await syncPaymentFromStripe(orderId).catch(() => null);
    order = await getBuyerOrder(orderId);
  }
  const t = await getTranslations("orders");
  const wallet = { apple: !!appleCredentials(), google: !!googleCredentials() };
  // badges officiels s'ils sont déposés dans public/wallet (voir LISEZMOI.md), sinon bouton texte
  const badgeLocale = (await getLocale()) === "en" ? "en" : "fr";
  const badge = (name: string) => (existsSync(join(process.cwd(), "public", "wallet", `${name}-${badgeLocale}.svg`)) ? `/wallet/${name}-${badgeLocale}.svg` : null);
  const badges = { apple: badge("add-to-apple-wallet"), google: badge("add-to-google-wallet") };
  const locale = (await getLocale()) as Locale;
  const e = order.event;
  const eventHref = `/${e.slug}`;
  const place = e.locationType === "ONLINE" ? null : [e.locationName, [e.postalCode, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const qrs = order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" ? await Promise.all(order.tickets.map((tk) => QRCode.toString(tk.code, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: palette.charbon, light: palette.blanc } }))) : [];
  // revente (section 9.13) : annonces ouvertes et conditions, billet par billet
  const openListings = await db.resaleListing.findMany({ where: { sellerOrderId: order.id, status: { in: ["ACTIVE", "RESERVED"] } }, select: { id: true, ticketId: true, status: true, priceMinor: true, linkCode: true } });
  const quotes = new Map(await Promise.all(order.tickets.filter((tk) => tk.status === "VALID").map(async (tk) => [tk.id, await resaleQuote(token, tk.id).catch(() => null)] as const)));
  // US-REF-01 : remboursements possibles selon la politique de l'événement
  const refundsList = await db.refund.findMany({ where: { orderId: order.id }, include: { items: { select: { ticketId: true } } }, orderBy: { createdAt: "desc" } });
  const pendingTickets = new Set(refundsList.filter((r) => ["REQUESTED", "APPROVED", "PROCESSING"].includes(r.status)).flatMap((r) => r.items.map((i) => i.ticketId)));
  const refundCheck = checkRefundRequest({ policy: e.refundPolicy, deadlineAt: e.refundDeadlineAt, eventStatus: e.status, eventStartsAt: e.startsAt, lastMajorChangeAt: e.lastMajorChangeAt, now: new Date() });
  const refundableTickets = order.tickets.filter((tk) => tk.status === "VALID" && !pendingTickets.has(tk.id));
  const holdActive = order.status === "PENDING" && !!order.holdExpiresAt && order.holdExpiresAt > new Date();

  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-3xl gap-8 px-5 pt-4 pb-16 sm:px-8">
        {order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" ? (
          <>
            <header className="grid gap-2">
              <p className="font-label text-sm font-bold text-ink-muted">{t("reference", { reference: order.reference })}</p>
              <h1 className="font-display text-[clamp(2rem,6vw,3rem)] leading-[0.95] tracking-[-0.05em]">{t("ticketsTitle")}</h1>
              <p className="text-ink-muted">{t("ticketsIntro", { count: order.tickets.length })}</p>
            </header>
            <section className="grid gap-1 rounded-lg bg-surface-sunken p-5" aria-label={e.title}>
              <p className="font-display text-xl tracking-[-0.03em]">{e.title}</p>
              <p>
                {formatDate(e.startsAt, e.timezone, locale)} · {formatTime(e.startsAt, e.timezone, locale)}
              </p>
              {place ? <p className="text-ink-muted">{place}</p> : null}
              {e.locationType !== "PHYSICAL" && e.onlineUrl ? (
                <a href={e.onlineUrl} target="_blank" rel="noreferrer" className="mt-1 font-semibold underline underline-offset-4">
                  {t("joinOnline")}
                </a>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/billets/${token}/calendrier.ics`} className={buttonClass("secondary", "sm")}>
                  {t("addToCalendar")}
                </a>
                <a href={`/billets/${token}/billets.pdf`} className={buttonClass("secondary", "sm")}>
                  {t("downloadPdf")}
                </a>
              </div>
            </section>
            <ol className="grid gap-4 sm:grid-cols-2">
              {order.tickets.map((tk, i) => (
                <li key={tk.id} className="grid min-w-0 justify-items-center gap-3 rounded-[var(--r-panel)] bg-surface-raised p-5 text-center shadow-md ring-1 ring-line [&>*]:max-w-full">
                  <p className="font-label text-xs font-bold text-ink-muted">{t("ticketOf", { index: i + 1, count: order.tickets.length })}</p>
                  <p className="font-display text-lg tracking-[-0.03em]">{tk.ticketType.name}</p>
                  {tk.seat ? <p className="text-sm font-semibold" data-testid="seat">{t("seat", { row: tk.seat.row.name, seat: tk.seat.label })}</p> : null}
                  {(() => {
                    const listing = openListings.find((l) => l.ticketId === tk.id);
                    if (tk.status === "REFUNDED") return <p className="rounded-md bg-surface-sunken px-4 py-6 text-sm font-semibold">{t("ticketStatus_REFUNDED")}</p>;
                    if (tk.status === "VOID") return <p className="rounded-md bg-surface-sunken px-4 py-6 text-sm font-semibold">{t(tk.voidReason === "RESOLD" ? "ticketResold" : "ticketStatus_VOID")}</p>;
                    if (listing) return <p className="rounded-md bg-surface-sunken px-4 py-6 text-sm">{t("qrHiddenWhileListed")}</p>;
                    return (
                      <>
                        <div className="w-full max-w-[15rem] rounded-md bg-blanc p-2 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={t("qrLabel", { code: tk.shortCode })} dangerouslySetInnerHTML={{ __html: qrs[i]! }} />
                        <p className="font-mono text-lg tracking-[0.2em]">{tk.shortCode}</p>
                        {/* US-POST-03 : ajout au portefeuille du téléphone (si Evoly est configuré pour Apple ou Google) */}
                        {wallet.apple || wallet.google ? (
                          <div className="flex flex-wrap justify-center gap-2">
                            {wallet.apple ? (
                              <a href={`/billets/${token}/wallet/${tk.id}/apple`} className={badges.apple ? "inline-flex" : "inline-flex h-11 items-center rounded-lg bg-noir px-4 text-sm font-semibold text-blanc"}>
                                {badges.apple ? <img src={badges.apple} alt={t("addToAppleWallet")} className="h-11 w-auto" /> : t("addToAppleWallet")}
                              </a>
                            ) : null}
                            {wallet.google ? (
                              <a href={`/billets/${token}/wallet/${tk.id}/google`} rel="noreferrer" className={badges.google ? "inline-flex" : "inline-flex h-11 items-center rounded-lg bg-noir px-4 text-sm font-semibold text-blanc"}>
                                {badges.google ? <img src={badges.google} alt={t("addToGoogleWallet")} className="h-11 w-auto" /> : t("addToGoogleWallet")}
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                  {e.allowHolderChange && e.startsAt > new Date() && tk.status === "VALID" && !openListings.some((l) => l.ticketId === tk.id) ? (
                    <HolderEditor token={token} ticketId={tk.id} firstName={tk.holderFirstName ?? ""} lastName={tk.holderLastName ?? ""} />
                  ) : tk.holderFirstName ? (
                    <p className="text-sm">{`${tk.holderFirstName} ${tk.holderLastName ?? ""}`.trim()}</p>
                  ) : null}
                  {tk.status === "CHECKED_IN" ? <p className="text-sm font-semibold text-warning">{t("ticketStatus_CHECKED_IN")}</p> : null}
                  {tk.status === "VALID" && quotes.get(tk.id) ? (
                    <ResaleControl
                      token={token}
                      ticketId={tk.id}
                      currency={order.currency}
                      faceValueMinor={tk.faceValueMinor}
                      terms={quotes.get(tk.id)!.terms}
                      canResell={quotes.get(tk.id)!.blockers.length === 0}
                      listing={(() => {
                        const l = openListings.find((x) => x.ticketId === tk.id);
                        return l ? { id: l.id, status: l.status, priceMinor: l.priceMinor, url: resaleShortUrl(l.linkCode) } : null;
                      })()}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="text-center text-sm text-ink-muted">{t("showAtEntrance")}</p>
            {refundsList.length > 0 ? (
              <ul className="grid gap-2">
                {refundsList.map((r) => (
                  <li key={r.id} className="rounded-md bg-surface-sunken px-4 py-3 text-sm">
                    <p className="font-semibold">{t(`refundState_${r.status}`, { count: r.items.length })}</p>
                    {r.responseMessage ? <p className="text-ink-muted">{t("refundResponse", { message: r.responseMessage })}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {refundCheck.canRequest && refundableTickets.length > 0 ? (
              <RefundRequest
                token={token}
                tickets={refundableTickets.map((tk) => ({ id: tk.id, label: `${tk.ticketType.name} · ${tk.shortCode}` }))}
                automatic={!refundCheck.outOfDeadline && (refundCheck.reason === "EVENT_CHANGED" || e.refundPolicy === "ALWAYS" || e.refundPolicy === "UNTIL_DEADLINE")}
                outOfDeadline={refundCheck.outOfDeadline}
                policyText={t(refundCheck.reason === "EVENT_CHANGED" ? "policy_EVENT_CHANGED" : `policy_${e.refundPolicy}`)}
              />
            ) : null}
            <p className="text-center text-sm text-ink-muted">{t("paidTotal", { total: order.totalMinor === 0 ? t("free") : formatMoney(order.totalMinor, order.currency, locale) })}</p>
          </>
        ) : (
          <section className="grid gap-4 rounded-[var(--r-panel)] bg-surface-raised p-6 shadow-md ring-1 ring-line" aria-live="polite">
            <h1 className="font-display text-2xl tracking-[-0.03em]">{t(order.status === "PENDING" ? (order.stripePaymentIntentId ? "confirmingTitle" : holdActive ? "heldTitle" : "expiredTitle") : e.status === "CANCELLED" ? "status_EVENT_CANCELLED" : `status_${order.status}`)}</h1>
            <p className="text-ink-muted">{t(order.status === "PENDING" ? (order.stripePaymentIntentId ? "confirmingBody" : holdActive ? "heldBody" : "expiredBody") : e.status === "CANCELLED" ? "statusBody_EVENT_CANCELLED" : `statusBody_${order.status}`)}</p>
            {order.status === "PENDING" && order.stripePaymentIntentId ? <AutoRefresh /> : null}
            <Link href={eventHref} className={buttonClass("dark", "lg", "justify-self-start")}>
              {t("backToEvent")}
            </Link>
          </section>
        )}
      </div>
      <p className="mx-auto mt-6 max-w-xl px-5 text-center text-sm"><a href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/mon-espace`} className="font-semibold underline underline-offset-4">{t("allMyTickets")}</a></p>
    </PublicShell>
  );
}
