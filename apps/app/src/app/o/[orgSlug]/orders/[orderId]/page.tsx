import { can } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { getOrderDetail } from "@/server/ordersAdmin";
import { CorrectEmail, HolderForm, RefundDecision, RefundTickets, ResendTickets, RevertCheckIn } from "./OrderActions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ordersAdmin");
  return { title: t("detailTitle") };
}

const REFUND_TONES = { REQUESTED: "warning", APPROVED: "neutral", PROCESSING: "neutral", SUCCEEDED: "success", REJECTED: "neutral", FAILED: "danger" } as const;

/** RG-ORD-01 : acheteur, billets, scans, paiement, remboursements, reventes, e-mails. */
export default async function OrderDetailPage({ params }: { params: Promise<{ orgSlug: string; orderId: string }> }) {
  const { orgSlug, orderId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "ORDERS_VIEW")) notFound();
  const order = await getOrderDetail(ctx, orderId).catch(() => null);
  if (!order) notFound();
  const t = await getTranslations("ordersAdmin");
  const locale = (await getLocale()) as Locale;
  const tz = order.event.timezone;
  const money = (v: number) => formatMoney(v, order.currency, locale);
  const manage = can(ctx.membership, "ORDERS_MANAGE") && !ctx.readOnly;
  const refunds = can(ctx.membership, "REFUNDS_MANAGE") && !ctx.readOnly;
  const finance = can(ctx.membership, "FINANCE_VIEW");
  const pendingRefundTicketIds = new Set(
    order.tickets.filter((tk) => tk.refundItems.some((i) => ["REQUESTED", "APPROVED", "PROCESSING"].includes(i.refund.status))).map((tk) => tk.id),
  );
  const refundable = order.tickets.filter((tk) => (tk.status === "VALID" || tk.status === "CHECKED_IN") && !pendingRefundTicketIds.has(tk.id));
  return (
    <div className="grid max-w-5xl gap-6">
      <header className="grid gap-2">
        <Link href={`/o/${orgSlug}/orders`} className="text-sm font-semibold text-ink-muted hover:text-ink">
          ← {t("backToOrders")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">
            {order.buyerFirstName} {order.buyerLastName}
          </h1>
          <Badge tone={order.status === "PAID" ? "success" : order.status === "PARTIALLY_REFUNDED" ? "warning" : "neutral"}>
            {t(order.status === "PAID" && order.totalMinor === 0 ? "status_CONFIRMED" : `status_${order.status}`)}
          </Badge>
        </div>
        <p className="text-ink-muted">
          <span className="font-mono">{order.reference}</span> · {order.event.title} · {formatDateTime(order.createdAt, tz, locale, "short")}
          {order.source === "RESALE" ? ` · ${t("fromResale")}` : order.source === "COMPLIMENTARY" ? ` · ${t("fromComplimentary")}` : ""}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid content-start gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("buyer")}</h2>
          <p>{order.buyerEmail}</p>
          {order.buyerPhone ? <p>{order.buyerPhone}</p> : null}
          <p className="text-sm text-ink-muted">{order.marketingOptIn ? t("marketingYes") : t("marketingNo")}</p>
          {manage ? (
            <div className="flex flex-wrap gap-2">
              {order.status === "PAID" || order.status === "PARTIALLY_REFUNDED" ? <ResendTickets orgSlug={orgSlug} orderId={order.id} /> : null}
              <CorrectEmail orgSlug={orgSlug} orderId={order.id} email={order.buyerEmail} />
            </div>
          ) : null}
        </Card>
        <Card className="grid content-start gap-2">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("payment")}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-ink-muted">{t("total")}</dt>
            <dd className="text-right font-semibold tabular-nums">{order.totalMinor === 0 ? t("free") : money(order.totalMinor)}</dd>
            {order.discountMinor > 0 ? (
              <>
                <dt className="text-ink-muted">{t("discount", { code: order.promoCode?.code ?? "" })}</dt>
                <dd className="text-right tabular-nums">−{money(order.discountMinor)}</dd>
              </>
            ) : null}
            {finance && order.totalMinor > 0 ? (
              <>
                <dt className="text-ink-muted">{t("commission")}</dt>
                <dd className="text-right tabular-nums">{money(order.applicationFeeMinor)}</dd>
                <dt className="text-ink-muted">{t("stripeFees")}</dt>
                <dd className="text-right tabular-nums">{order.paymentFeeMinor != null ? money(order.paymentFeeMinor) : "-"}</dd>
                <dt className="text-ink-muted">{t("net")}</dt>
                <dd className="text-right tabular-nums">{order.netMinor != null ? money(order.netMinor) : "-"}</dd>
              </>
            ) : null}
            {order.refundedMinor > 0 ? (
              <>
                <dt className="text-ink-muted">{t("refunded")}</dt>
                <dd className="text-right tabular-nums">−{money(order.refundedMinor)}</dd>
              </>
            ) : null}
            {order.paymentMethodType ? (
              <>
                <dt className="text-ink-muted">{t("method")}</dt>
                <dd className="text-right">{t.has(`method_${order.paymentMethodType}`) ? t(`method_${order.paymentMethodType}`) : order.paymentMethodType}</dd>
              </>
            ) : null}
          </dl>
        </Card>
      </div>

      <Card className="grid gap-3">
        <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("ticketsTitle", { count: order.tickets.length })}</h2>
        <ul className="grid gap-2">
          {order.tickets.map((tk) => (
            <li key={tk.id} className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="grid gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {tk.ticketType.name}
                    {tk.seat ? ` · ${tk.seat.row.name}${tk.seat.label}` : ""}
                  </span>
                  <span className="font-mono text-sm">{tk.shortCode}</span>
                  <Badge tone={tk.status === "VALID" ? "success" : tk.status === "CHECKED_IN" ? "dark" : "neutral"}>{t(`ticket_${tk.status}`)}</Badge>
                </p>
                <p className="text-sm text-ink-muted">
                  {tk.holderFirstName ? `${tk.holderFirstName} ${tk.holderLastName ?? ""}${tk.holderEmail ? ` · ${tk.holderEmail}` : ""}` : t("noHolder")}
                  {tk.checkIns[0]
                    ? ` · ${t("scannedAt", { time: formatDateTime(tk.checkIns[0].scannedAt, tz, locale, "short"), gate: tk.checkIns[0].gate ?? "" })}`
                    : ""}
                  {tk.voidReason ? ` · ${t(`void_${tk.voidReason}`)}` : ""}
                </p>
              </div>
              {tk.status === "CHECKED_IN" && can(ctx.membership, "CHECKIN_MANAGE") && !ctx.readOnly ? (
                <RevertCheckIn orgSlug={orgSlug} orderId={order.id} ticketId={tk.id} />
              ) : null}
              {manage && (tk.status === "VALID" || tk.status === "CHECKED_IN") ? (
                <HolderForm orgSlug={orgSlug} orderId={order.id} ticketId={tk.id} firstName={tk.holderFirstName ?? ""} lastName={tk.holderLastName ?? ""} />
              ) : null}
            </li>
          ))}
        </ul>
        {refunds && (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") ? (
          <RefundTickets
            orgSlug={orgSlug}
            orderId={order.id}
            currency={order.currency}
            tickets={refundable.map((tk) => ({
              id: tk.id,
              label: `${tk.ticketType.name} ${tk.shortCode}`,
              faceValueMinor: tk.faceValueMinor,
              scanned: tk.status === "CHECKED_IN",
            }))}
          />
        ) : null}
      </Card>

      {order.answers.length > 0 ? (
        <Card className="grid gap-2">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("answersTitle")}</h2>
          <dl className="grid gap-2 text-sm">
            {order.answers.map((a) => {
              const v = (a.value as { value?: unknown })?.value;
              const ticket = a.ticketId ? order.tickets.find((tk) => tk.id === a.ticketId) : null;
              return (
                <div key={a.id} className="grid gap-0.5 border-t border-line pt-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <dt className="text-ink-muted">
                    {a.question.label}
                    {ticket ? <span className="font-mono"> · {ticket.shortCode}</span> : null}
                  </dt>
                  <dd className="font-semibold">{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? t("yes") : t("no")) : String(v ?? "")}</dd>
                </div>
              );
            })}
          </dl>
        </Card>
      ) : null}

      {order.refunds.length > 0 ? (
        <Card className="grid gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("refundsTitle")}</h2>
          <ul className="grid gap-3">
            {order.refunds.map((r) => (
              <li key={r.id} className="grid gap-2 border-t border-line pt-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">{r.amountMinor === 0 ? t("free") : money(r.amountMinor)}</span>
                  <Badge tone={REFUND_TONES[r.status]}>{t(`refund_${r.status}`)}</Badge>
                  {r.isOutOfDeadline ? <Badge tone="warning">{t("outOfDeadline")}</Badge> : null}
                  <span className="text-sm text-ink-muted">
                    {t(`initiator_${r.initiator}`)} · {t(`reason_${r.reason}`)} · {r.items.map((i) => i.ticket.shortCode).join(", ")} ·{" "}
                    {formatDateTime(r.createdAt, tz, locale, "short")}
                  </span>
                </p>
                {r.message ? <p className="text-sm">« {r.message} »</p> : null}
                {r.responseMessage ? (
                  <p className="text-sm text-ink-muted">{t("response", { name: r.handledBy?.name ?? "", message: r.responseMessage })}</p>
                ) : null}
                {r.failureReason ? <p className="text-sm text-danger">{t("failure", { reason: r.failureReason })}</p> : null}
                {refunds && r.status === "REQUESTED" ? <RefundDecision orgSlug={orgSlug} orderId={order.id} refundId={r.id} mode="pending" /> : null}
                {refunds && r.status === "FAILED" ? <RefundDecision orgSlug={orgSlug} orderId={order.id} refundId={r.id} mode="failed" /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {order.soldListings.length > 0 ? (
        <Card className="grid gap-2">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("resaleTitle")}</h2>
          {order.soldListings.map((l) => (
            <p key={l.id} className="text-sm">
              {t(`resale_${l.status}`)} · {l.priceMinor === 0 ? t("free") : money(l.priceMinor)}
              {l.sellerRefundMinor ? ` · ${t("resaleRefunded", { amount: money(l.sellerRefundMinor) })}` : ""}
            </p>
          ))}
        </Card>
      ) : null}

      <Card className="grid gap-2">
        <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("emailsTitle")}</h2>
        {order.emailMessages.length === 0 ? <p className="text-sm text-ink-muted">{t("noEmails")}</p> : null}
        <ul className="grid gap-1">
          {order.emailMessages.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
              <span className="min-w-0 truncate">
                {m.subject} · <span className="text-ink-muted">{m.toEmail}</span>
              </span>
              <span className="text-ink-muted">
                {formatDateTime(m.queuedAt, tz, locale, "short")} · {t(`email_${m.status}`)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
