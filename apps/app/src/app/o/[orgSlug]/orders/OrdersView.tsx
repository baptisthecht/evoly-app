import { can, hasFeature } from "@evoly/core";
import {
  formatDateTime,
  formatMoney,
  formatShortDate,
  formatTime,
  type Locale,
} from "@evoly/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/Controls";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { listDistributors } from "@/server/distributors";
import { searchExternalTickets } from "@/server/externalImport";
import { searchOrders, type OrderFilter } from "@/server/ordersAdmin";
import { OrdersTable } from "./OrdersTable";
import { ArrowRightIcon } from "@/components/ui/icons";

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
  CANCELLED: "neutral",
} as const;

/** Canaux d'une commande Evoly (maquette : « Canal : Tous »). */
const SOURCES = ["ONLINE", "BOX_OFFICE", "COMPLIMENTARY", "RESALE"] as const;
type Source = (typeof SOURCES)[number];

export interface OrdersSearch {
  q?: string;
  event?: string;
  type?: string;
  filter?: string;
  page?: string;
  /** canal : un canal Evoly (en ligne, sur place…), un réseau, ou vide pour tous */
  channel?: string;
  xpage?: string;
}

/**
 * US-ORD-01 : recherche et filtres (refonte A3, maquette UIUX/pages-a3.html, « Commandes »). Avec `eventId`, la même
 * liste dans l'onglet Participants d'un événement : ni filtre ni colonne « Événement », qui y seraient redondants.
 */
export async function OrdersView({
  orgSlug,
  sp: raw,
  eventId,
}: {
  orgSlug: string;
  sp: OrdersSearch;
  eventId?: string;
}) {
  const sp = eventId ? { ...raw, event: eventId } : raw;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "ORDERS_VIEW")) notFound();
  const filter = (FILTERS as string[]).includes(sp.filter ?? "")
    ? (sp.filter as OrderFilter)
    : "ALL";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const source = (SOURCES as readonly string[]).includes(sp.channel ?? "")
    ? (sp.channel as Source)
    : undefined;
  const [result, events] = await Promise.all([
    searchOrders(ctx, {
      q: sp.q,
      eventId: sp.event || undefined,
      ticketTypeId: sp.event && sp.type ? sp.type : undefined,
      filter,
      source,
      page,
    }),
    // le filtre « Événement » : inutile dans l'onglet Participants d'un événement
    eventId
      ? Promise.resolve([] as { id: string; title: string }[])
      : db.event.findMany({
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
  const [t, tc] = await Promise.all([
    getTranslations("ordersAdmin"),
    getTranslations("common"),
  ]);
  const locale = (await getLocale()) as Locale;
  // billets vendus par les réseaux, comme de vrais achats (docs/COMPATIBILITE_RESEAUX.md)
  const networks =
    sp.event && hasFeature(ctx.features, "DISTRIBUTION")
      ? await listDistributors(ctx)
      : [];
  const channel = sp.channel ?? "";
  const networkChannel = networks.find((n) => n.id === channel);
  const showOrders = !networkChannel;
  const showNetworks =
    networks.length > 0 && !source && (channel === "" || !!networkChannel);
  const external = showNetworks
    ? await searchExternalTickets(ctx, {
        eventId: sp.event!,
        distributorId: networkChannel?.id,
        q: sp.q,
        page: Math.max(0, Number(sp.xpage ?? 0) || 0),
      })
    : null;
  const qs = (extra: Record<string, string | number>) =>
    new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}),
      ...(sp.event && !eventId ? { event: sp.event } : {}),
      ...(sp.type ? { type: sp.type } : {}),
      ...(filter !== "ALL" ? { filter } : {}),
      ...(channel ? { channel } : {}), // le canal choisi suit la pagination
      ...Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [k, String(v)]),
      ),
    }).toString();
  const tz = ctx.organization.timezone;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  // « aujourd'hui », « hier », sinon « 5 nov. » ; l'heure dessous
  const when = (d: Date) => {
    const days = Math.round(
      (Date.parse(dayKey(d)) - Date.parse(dayKey(new Date()))) / 86_400_000,
    );
    return {
      day:
        days === 0 || days === -1
          ? rtf.format(days, "day")
          : formatShortDate(d, tz, locale),
      time: formatTime(d, tz, locale),
    };
  };
  const label = (prefix: string) => tc("labelColon", { label: prefix });
  const eventName = events.find((e) => e.id === sp.event)?.title ?? t("all");
  const typeName = types.find((x) => x.id === sp.type)?.name ?? t("all");
  const channelName = source
    ? t(`channel_${source}`)
    : (networkChannel?.name ?? t("all"));
  const statusName = filter === "ALL" ? t("all") : t(`filter_${filter}`);
  const total = showOrders ? result.total : (external?.total ?? 0);
  const perPage = 50;
  const shown =
    (showOrders ? result.rows.length : 0) +
    (showNetworks && external ? external.rows.length : 0);
  const pages = Math.max(
    showOrders ? result.pages : 0,
    showNetworks && external ? external.pages : 0,
  );
  return (
    <div className="grid gap-3.5">
      {result.pendingRequests > 0 && filter !== "REFUND_REQUESTED" ? (
        <Link
          href={`${eventId ? `/o/${orgSlug}/events/${eventId}/orders` : `/o/${orgSlug}/orders`}?filter=REFUND_REQUESTED`}
          className="flex items-center justify-between gap-3 rounded-[10px] bg-warning-soft px-3.5 py-2.5 text-[13.5px] font-medium text-warning"
        >
          <span>{t("pendingRequests", { count: result.pendingRequests })}</span>
          <ArrowRightIcon className="size-4 shrink-0" />
        </Link>
      ) : null}
      {/* la barre d'outils de la maquette : recherche de 300 px, puis « Événement : Tous », « Canal : Tous », « Statut : Tous » */}
      <form
        className="flex flex-wrap items-center gap-2 max-sm:gap-3"
        role="search"
      >
        {/* sur téléphone (maquette « Sur téléphone ») : la recherche en 40 px sur toute la largeur, puis les filtres sur
            une rangée qui défile */}
        <SearchField
          label={t("searchLabel")}
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="w-full max-sm:h-10 sm:w-[300px]"
        />
        <div className="flex gap-2 max-sm:-mx-[18px] max-sm:w-[calc(100%+36px)] max-sm:overflow-x-auto max-sm:px-[18px] max-sm:[scrollbar-width:none] sm:contents">
          {eventId ? null : (
            <FilterSelect
              prefix={label(t("eventFilter"))}
              valueLabel={eventName}
              name="event"
              defaultValue={sp.event ?? ""}
              autoSubmit
            >
              <option value="">{t("all")}</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </FilterSelect>
          )}
          {types.length > 0 ? (
            <FilterSelect
              prefix={label(t("ticketTypeFilter"))}
              valueLabel={typeName}
              name="type"
              defaultValue={sp.type ?? ""}
              autoSubmit
            >
              <option value="">{t("all")}</option>
              {types.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </FilterSelect>
          ) : null}
          <FilterSelect
            prefix={label(t("channelFilter"))}
            valueLabel={channelName}
            name="channel"
            defaultValue={channel}
            autoSubmit
          >
            <option value="">{t("all")}</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`channel_${s}`)}
              </option>
            ))}
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            prefix={label(t("statusFilter"))}
            valueLabel={statusName}
            name="filter"
            defaultValue={filter}
            autoSubmit
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === "ALL" ? t("all") : t(`filter_${f}`)}
              </option>
            ))}
          </FilterSelect>
        </div>
      </form>
      <OrdersTable
        caption={t("tableCaption")}
        orgSlug={orgSlug}
        showEvent={!eventId}
        canManage={can(ctx.membership, "ORDERS_MANAGE") && !ctx.readOnly}
        rows={[
          ...(showOrders
            ? result.rows.map((o) => {
                const complimentary = o.source === "COMPLIMENTARY";
                const free = o.totalMinor === 0;
                const w = when(o.paidAt ?? o.createdAt);
                return {
                  id: o.id,
                  kind: "order" as const,
                  name:
                    `${o.buyerFirstName} ${o.buyerLastName}`.trim() ||
                    o.buyerEmail,
                  email: o.buyerEmail,
                  event: o.event.title,
                  reference: o.reference,
                  channel: t(`channel_${o.source}`),
                  statusLabel: t(
                    o.status === "PAID" && complimentary
                      ? "status_SENT"
                      : o.status === "PAID" && free
                        ? "status_CONFIRMED"
                        : `status_${o.status}`,
                  ),
                  statusTone: (TONES[o.status as keyof typeof TONES] ??
                    "neutral") as "neutral",
                  extra: [
                    ...(o.refunds.some((r) => r.status === "REQUESTED")
                      ? [
                          {
                            label: t("refundRequested"),
                            tone: "warning" as const,
                          },
                        ]
                      : []),
                    ...(o.refunds.some((r) => r.status === "FAILED")
                      ? [{ label: t("refundFailed"), tone: "danger" as const }]
                      : []),
                  ],
                  tickets: o._count.tickets,
                  total: complimentary
                    ? t("offered")
                    : free
                      ? t("freeLower")
                      : formatMoney(o.totalMinor, o.currency, locale),
                  totalMinor: o.totalMinor,
                  refunded:
                    o.status === "PARTIALLY_REFUNDED" && o.refundedMinor > 0
                      ? t("refundedAmount", {
                          amount: formatMoney(
                            o.refundedMinor,
                            o.currency,
                            locale,
                          ),
                        })
                      : null,
                  day: w.day,
                  time: w.time,
                  dateAt: (o.paidAt ?? o.createdAt).getTime(),
                  href: `/o/${orgSlug}/orders/${o.id}`,
                };
              })
            : []),
          ...(showNetworks && external
            ? external.rows.map((x) => {
                const w = x.checkedInAt ? when(x.checkedInAt) : null;
                return {
                  id: x.id,
                  kind: "network" as const,
                  name:
                    x.holderName ??
                    t("networkNoName", {
                      network: x.distributor.name,
                      last: (x.code ?? x.reservation ?? "").slice(-4),
                    }),
                  email: [x.holderEmail, x.holderPhone]
                    .filter(Boolean)
                    .join(", "),
                  event: [x.ticketType?.name, x.seatLabel]
                    .filter(Boolean)
                    .join(", "),
                  reference: x.code ?? `${x.reservation ?? ""} ${x.rank}`,
                  channel: x.distributor.name,
                  statusLabel:
                    x.status === "CANCELLED"
                      ? t("networkCancelled")
                      : x.checkedInAt
                        ? t("networkEntered", {
                            time: formatDateTime(x.checkedInAt, tz, locale),
                          })
                        : t("networkNotEntered"),
                  statusTone: (x.status === "CANCELLED"
                    ? "danger"
                    : x.checkedInAt
                      ? "success"
                      : "neutral") as "neutral",
                  extra: [],
                  tickets: 1,
                  total: "-",
                  totalMinor: -1,
                  refunded: null,
                  day: w?.day ?? "",
                  time: w?.time ?? "",
                  dateAt: x.checkedInAt ? x.checkedInAt.getTime() : 0,
                  href: null,
                };
              })
            : []),
        ]}
        footer={
          total > 0 ? (
            // la pagination de la maquette : « 1 à 50 sur 486 commandes », puis « Précédentes » et « Suivantes »
            <nav
              className="flex flex-wrap items-center justify-between gap-3 pt-2.5 text-[13px] text-ink-muted"
              aria-label={t("pagination")}
            >
              <span>
                {t("range", {
                  from: page * perPage + 1,
                  to: page * perPage + shown,
                  count: total,
                })}
              </span>
              {pages > 1 ? (
                <span className="flex gap-2">
                  {page > 0 ? (
                    <Link
                      href={`?${qs({ page: page - 1, xpage: page - 1 })}`}
                      className={buttonClass("secondary")}
                    >
                      {t("previous")}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className={buttonClass("secondary", "md", "opacity-50")}
                    >
                      {t("previous")}
                    </span>
                  )}
                  {page < pages - 1 ? (
                    <Link
                      href={`?${qs({ page: page + 1, xpage: page + 1 })}`}
                      className={buttonClass("secondary")}
                    >
                      {t("next")}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className={buttonClass("secondary", "md", "opacity-50")}
                    >
                      {t("next")}
                    </span>
                  )}
                </span>
              ) : null}
            </nav>
          ) : null
        }
      />
    </div>
  );
}
