import { can, hasFeature } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { listDistributors } from "@/server/distributors";
import { searchExternalTickets } from "@/server/externalImport";
import { searchOrders, type OrderFilter } from "@/server/ordersAdmin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

const FILTERS: OrderFilter[] = [
  "ALL",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_FAILED",
];
const TONES = {
  PAID: "success",
  PARTIALLY_REFUNDED: "warning",
  REFUNDED: "neutral",
  FAILED: "danger",
} as const;

/** US-ORD-01 : recherche et filtres. */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    q?: string;
    event?: string;
    type?: string;
    filter?: string;
    page?: string;
    /** canal : « evoly », un réseau, ou vide pour tous (événement choisi) */
    channel?: string;
    xpage?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "ORDERS_VIEW")) notFound();
  const filter = (FILTERS as string[]).includes(sp.filter ?? "")
    ? (sp.filter as OrderFilter)
    : "ALL";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const [result, events] = await Promise.all([
    searchOrders(ctx, {
      q: sp.q,
      eventId: sp.event || undefined,
      ticketTypeId: sp.event && sp.type ? sp.type : undefined,
      filter,
      page,
    }),
    db.event.findMany({
      where: {
        organizationId: ctx.organization.id,
        deletedAt: null,
        status: { not: "DRAFT" },
      },
      select: { id: true, title: true },
      orderBy: { startsAt: "desc" },
    }),
  ]);
  // US-ORD-01 : filtre par tarif, une fois l'événement choisi
  const types = sp.event
    ? await db.ticketType.findMany({
        where: {
          eventId: sp.event,
          event: { organizationId: ctx.organization.id },
        },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const t = await getTranslations("ordersAdmin");
  const locale = (await getLocale()) as Locale;
  // billets vendus par les réseaux, comme de vrais achats (docs/COMPATIBILITE_RESEAUX.md)
  const networks =
    sp.event && hasFeature(ctx.features, "DISTRIBUTION")
      ? await listDistributors(ctx)
      : [];
  const channel = networks.length ? (sp.channel ?? "") : "";
  const networkChannel = networks.find((n) => n.id === channel);
  const showOrders = !networkChannel;
  const showNetworks =
    networks.length > 0 && (channel === "" || !!networkChannel);
  const external = showNetworks
    ? await searchExternalTickets(ctx, {
        eventId: sp.event!,
        distributorId: networkChannel?.id,
        q: sp.q,
        page: Math.max(0, Number(sp.xpage ?? 0) || 0),
      })
    : null;
  const xpage = Math.max(0, Number(sp.xpage ?? 0) || 0);
  const qs = (extra: Record<string, string | number>) =>
    new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}),
      ...(sp.event ? { event: sp.event } : {}),
      ...(filter !== "ALL" ? { filter } : {}),
      ...(channel ? { channel } : {}), // le canal choisi suit la pagination
      ...Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [k, String(v)]),
      ),
    }).toString();
  return (
    <div className="grid gap-6">
      {result.pendingRequests > 0 && filter !== "REFUND_REQUESTED" ? (
        <Link
          href={`/o/${orgSlug}/orders?filter=REFUND_REQUESTED`}
          className="flex items-center justify-between gap-3 rounded-lg bg-warning-soft px-5 py-4 font-semibold text-warning"
        >
          <span>{t("pendingRequests", { count: result.pendingRequests })}</span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
      <form
        className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]"
        role="search"
      >
        <Input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
        />
        <Select
          name="event"
          defaultValue={sp.event ?? ""}
          aria-label={t("eventFilter")}
        >
          <option value="">{t("allEvents")}</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
        {types.length > 0 ? (
          <Select
            name="type"
            defaultValue={sp.type ?? ""}
            aria-label={t("ticketTypeFilter")}
          >
            <option value="">{t("allTicketTypes")}</option>
            {types.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name}
              </option>
            ))}
          </Select>
        ) : null}
        {networks.length ? (
          <Select
            name="channel"
            defaultValue={channel}
            aria-label={t("channelFilter")}
          >
            <option value="">{t("allChannels")}</option>
            <option value="evoly">{t("channelEvoly")}</option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          name="filter"
          defaultValue={filter}
          aria-label={t("statusFilter")}
        >
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {t(`filter_${f}`)}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("dark", "md")}>
          {t("search")}
        </button>
      </form>
      {showOrders ? (
        <>
          <p className="text-sm text-ink-muted">
            {t("count", { count: result.total })}
          </p>
          {result.rows.length === 0 ? (
            <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {result.rows.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/o/${orgSlug}/orders/${o.id}`}
                    className="block rounded-lg"
                  >
                    <Card className="grid gap-2 transition-shadow hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="grid min-w-0 gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold">
                            {o.buyerFirstName} {o.buyerLastName}
                          </p>
                          <Badge
                            tone={
                              TONES[o.status as keyof typeof TONES] ?? "neutral"
                            }
                          >
                            {t(
                              o.status === "PAID" && o.totalMinor === 0
                                ? "status_CONFIRMED"
                                : `status_${o.status}`,
                            )}
                          </Badge>
                          {o.source === "COMPLIMENTARY" ? (
                            <Badge>{t("complimentary")}</Badge>
                          ) : null}
                          {o.refunds.some((r) => r.status === "REQUESTED") ? (
                            <Badge tone="warning">{t("refundRequested")}</Badge>
                          ) : null}
                          {o.refunds.some((r) => r.status === "FAILED") ? (
                            <Badge tone="danger">{t("refundFailed")}</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-sm text-ink-muted">
                          {o.buyerEmail} · {o.event.title} ·{" "}
                          <span className="font-mono">{o.reference}</span>
                        </p>
                      </div>
                      <div className="text-sm sm:text-right">
                        <p className="font-label font-bold tabular-nums">
                          {o.totalMinor === 0
                            ? t("free")
                            : formatMoney(o.totalMinor, o.currency, locale)}
                        </p>
                        <p className="text-ink-muted">
                          {t("tickets", { count: o._count.tickets })} ·{" "}
                          {formatDateTime(
                            o.createdAt,
                            ctx.organization.timezone,
                            locale,
                            "short",
                          )}
                        </p>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {result.pages > 1 ? (
            <nav
              className="flex justify-between gap-3"
              aria-label={t("pagination")}
            >
              {page > 0 ? (
                <Link
                  href={`?${qs({ page: page - 1 })}`}
                  className={buttonClass("secondary", "md")}
                >
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              {page < result.pages - 1 ? (
                <Link
                  href={`?${qs({ page: page + 1 })}`}
                  className={buttonClass("secondary", "md")}
                >
                  {t("next")}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      ) : null}
      {showNetworks && external ? (
        <section aria-labelledby="network-tickets" className="grid gap-3">
          <h2 id="network-tickets" className="font-display text-xl">
            {t("networkTitle")}
          </h2>
          <p className="text-sm text-ink-muted">
            {t("networkCount", { count: external.total })}
          </p>
          {external.rows.length === 0 ? (
            <p className="text-ink-muted">{t("networkEmpty")}</p>
          ) : (
            <ul className="grid gap-2">
              {external.rows.map((x) => (
                <li key={x.id}>
                  <Card className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="grid min-w-0 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">
                          {x.holderName ??
                            t("networkNoName", {
                              network: x.distributor.name,
                              last: (x.code ?? x.reservation ?? "").slice(-4),
                            })}
                        </p>
                        <Badge>{x.distributor.name}</Badge>
                        {x.status === "CANCELLED" ? (
                          <Badge tone="danger">{t("networkCancelled")}</Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-ink-muted">
                        {[
                          x.ticketType?.name,
                          x.seatLabel,
                          x.holderEmail,
                          x.holderPhone,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="truncate text-sm text-ink-muted">
                        <span className="font-mono">
                          {x.code ?? `${x.reservation ?? ""} · ${x.rank}`}
                        </span>
                      </p>
                    </div>
                    <p className="text-sm sm:text-right">
                      {x.checkedInAt
                        ? t("networkEntered", {
                            time: formatDateTime(
                              x.checkedInAt,
                              ctx.organization.timezone,
                              locale,
                            ),
                          })
                        : t("networkNotEntered")}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {external.pages > 1 ? (
            <nav
              className="flex justify-between gap-3"
              aria-label={t("networkPagination")}
            >
              {xpage > 0 ? (
                <Link
                  href={`?${qs({ xpage: xpage - 1 })}`}
                  className={buttonClass("secondary", "md")}
                >
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              {xpage < external.pages - 1 ? (
                <Link
                  href={`?${qs({ xpage: xpage + 1 })}`}
                  className={buttonClass("secondary", "md")}
                >
                  {t("next")}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
