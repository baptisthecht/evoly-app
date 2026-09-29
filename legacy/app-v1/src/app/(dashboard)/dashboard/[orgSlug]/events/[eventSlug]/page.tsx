import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { CopyButton } from "@/components/ui/CopyButton";

export default async function EventOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug, eventSlug } = await params;

  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) redirect("/dashboard");

  const event = await db.event.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: eventSlug } },
    include: {
      ticketTypes: { orderBy: { sortOrder: "asc" } },
      _count: { select: { orders: true } },
    },
  });
  if (!event) redirect(`/dashboard/${orgSlug}/events`);

  // KPIs
  const orders = await db.order.findMany({
    where: { eventId: event.id, status: "COMPLETED" },
    include: { tickets: true },
    orderBy: { createdAt: "desc" },
  });

  const revenue = orders.reduce((acc, o) => acc + (o.totalCents - o.feesCents), 0);
  const ticketsSold = orders.reduce((acc, o) => acc + o.tickets.length, 0);
  const totalCapacity = event.ticketTypes.reduce((acc, tt) => acc + (tt.quantity ?? 0), 0);
  const fillRate = totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : null;

  const checkedIn = await db.ticket.count({
    where: { order: { eventId: event.id }, checkedIn: true },
  });
  const checkinRate = ticketsSold > 0 ? Math.round((checkedIn / ticketsSold) * 100) : 0;

  // Sales over time (group by day)
  const salesByDay: Record<string, number> = {};
  orders.forEach((o) => {
    const day = o.createdAt.toISOString().split("T")[0];
    salesByDay[day] = (salesByDay[day] ?? 0) + o.tickets.length;
  });

  // Compute all public URLs for this event
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "evoly.me";

  const isPublished = event.status === "PUBLISHED";

  // URL principale via app.evoly.me
  const mainUrl = isPublished ? `${appUrl}/e/${event.slug}` : null;

  // URL via sous-domaine org : asso.evoly.me (affiche la même page via le middleware)
  const subdomainUrl = isPublished ? `https://${org.slug}.${baseDomain}/e/${event.slug}` : null;

  // Custom domains pointing to this event or this org
  const customDomains = isPublished
    ? await db.customDomain.findMany({
        where: {
          organizationId: org.id,
          status: "ACTIVE",
          OR: [{ eventId: event.id }, { eventId: null }],
        },
        select: { domain: true },
      })
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Revenus nets" value={`${(revenue / 100).toFixed(2)}€`} />
        <KpiCard label="Tickets vendus" value={ticketsSold.toString()} />
        {fillRate !== null && <KpiCard label="Remplissage" value={`${fillRate}%`} />}
        <KpiCard label="Check-in" value={`${checkedIn} / ${ticketsSold}`} sub={`${checkinRate}%`} />
      </div>

      {/* Public links */}
      {mainUrl && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Liens publics</p>

          {/* Main URL: app.evoly.me/e/slug */}
          <LinkRow label="URL principale" url={mainUrl} />

          {/* Subdomain URL: asso.evoly.me/e/slug */}
          <LinkRow label="Sous-domaine" url={subdomainUrl!} />

          {/* Custom domains */}
          {customDomains.map((cd) => (
            <LinkRow
              key={cd.domain}
              label="Domaine custom"
              url={`https://${cd.domain}/e/${event.slug}`}
            />
          ))}
        </div>
      )}

      {/* Ticket types summary */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Tickets</h2>
          <a
            href={`/dashboard/${orgSlug}/events/${eventSlug}/tickets`}
            className="text-xs text-violet-600 hover:underline"
          >
            Gérer
          </a>
        </div>
        {event.ticketTypes.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400 mb-3">Aucun ticket configuré.</p>
            <a
              href={`/dashboard/${orgSlug}/events/${eventSlug}/tickets`}
              className="text-sm text-violet-600 font-medium hover:underline"
            >
              + Ajouter un ticket
            </a>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {event.ticketTypes.map((tt) => {
              const cap = tt.quantity;
              const sold = tt.quantitySold;
              const pct = cap ? Math.round((sold / cap) * 100) : null;
              return (
                <li key={tt.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      tt.status === "ACTIVE" ? "bg-green-400" : "bg-gray-300"
                    }`} />
                    <span className="text-sm font-medium text-gray-900 truncate">{tt.name}</span>
                    <span className="text-xs text-gray-400">
                      {tt.priceCents === 0 ? "Gratuit" : `${(tt.priceCents / 100).toFixed(2)}€`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm text-gray-600">
                      {sold}{cap ? ` / ${cap}` : ""}
                    </span>
                    {pct !== null && (
                      <div className="w-16 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                        <div
                          className="bg-violet-500 h-1.5 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Commandes récentes</h2>
          <a href={`/dashboard/${orgSlug}/events/${eventSlug}/orders`} className="text-xs text-violet-600 hover:underline">
            Toutes
          </a>
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune commande pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {orders.slice(0, 5).map((order) => (
              <li key={order.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {order.buyerFirstName} {order.buyerLastName}
                  </p>
                  <p className="text-xs text-gray-400">{order.buyerEmail}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    {order.tickets.length} billet{order.tickets.length > 1 ? "s" : ""}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {((order.totalCents) / 100).toFixed(2)}€
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-violet-100">
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
        <p className="text-xs text-violet-800 font-mono truncate">{url}</p>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <CopyButton text={url} />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="px-2 py-1 text-[11px] font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">
          Voir
        </a>
      </div>
    </div>
  );
}
