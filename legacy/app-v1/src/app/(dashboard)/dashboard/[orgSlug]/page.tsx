import { auth } from "@/lib/auth";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";

export default async function DashboardHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    include: { plan: true },
  });

  if (!org) redirect("/dashboard");

  // KPIs — 30 derniers jours
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [recentOrders, previousOrders, activeEvents] = await Promise.all([
    db.order.findMany({
      where: {
        event: { organizationId: org.id },
        status: "COMPLETED",
        createdAt: { gte: thirtyDaysAgo },
      },
      include: { tickets: true },
    }),
    db.order.findMany({
      where: {
        event: { organizationId: org.id },
        status: "COMPLETED",
        createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
    }),
    db.event.count({
      where: {
        organizationId: org.id,
        status: "PUBLISHED",
      },
    }),
  ]);

  const revenue = recentOrders.reduce((acc, o) => acc + (o.totalCents - o.feesCents), 0);
  const prevRevenue = previousOrders.reduce((acc, o) => acc + (o.totalCents - o.feesCents), 0);
  const ticketsSold = recentOrders.reduce((acc, o) => acc + o.tickets.length, 0);
  const prevTickets = previousOrders.length; // simplified

  const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const ticketsChange = prevTickets > 0 ? ((ticketsSold - prevTickets) / prevTickets) * 100 : 0;

  // Check-in stats
  const checkedIn = await db.ticket.count({
    where: {
      order: { event: { organizationId: org.id } },
      checkedIn: true,
    },
  });
  const totalTickets = await db.ticket.count({
    where: {
      order: { event: { organizationId: org.id } },
      status: "ACTIVE",
    },
  });
  const checkinRate = totalTickets > 0 ? Math.round((checkedIn / totalTickets) * 100) : 0;

  // Build per-day chart data (30 days)
  const chartData: { date: string; revenue: number; tickets: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dayStr = day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    const dayOrders = recentOrders.filter(o => {
      const d = new Date(o.createdAt);
      return d.getDate() === day.getDate() && d.getMonth() === day.getMonth() && d.getFullYear() === day.getFullYear();
    });
    chartData.push({
      date: dayStr,
      revenue: Math.round(dayOrders.reduce((s, o) => s + (o.totalCents - o.feesCents), 0)) / 100,
      tickets: dayOrders.reduce((s, o) => s + o.tickets.length, 0),
    });
  }

  // Quota display
  const quotaUsed = org.ticketsSoldThisMonth;
  const quotaTotal = org.plan.monthlyFreeQuota;

  // Recent activity
  const recentActivity = await db.order.findMany({
    where: {
      event: { organizationId: org.id },
      status: { in: ["COMPLETED", "REFUNDED"] },
    },
    include: {
      event: { select: { title: true } },
      tickets: { take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Has stripe warning
  const stripeNotConnected = org.stripeAccountStatus === "NOT_CONNECTED";

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Stripe warning banner */}
      {stripeNotConnected && (
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-amber-800">
              <strong>Compte bancaire non connecté.</strong> Vous ne pouvez pas encore créer de tickets payants.
            </p>
          </div>
          <a
            href={`/dashboard/${orgSlug}/settings/stripe`}
            className="flex-shrink-0 text-sm font-medium text-amber-700 hover:text-amber-900 underline"
          >
            Connecter Stripe
          </a>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-1">30 derniers jours</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3">
          <KpiCard
            label="Revenus nets"
            value={`${(revenue / 100).toFixed(2)}€`}
            change={revenueChange}
          />
        </div>
        <KpiCard
          label="Tickets vendus"
          value={ticketsSold.toString()}
          change={ticketsChange}
        />
        <KpiCard
          label="Événements actifs"
          value={activeEvents.toString()}
        />
        <KpiCard
          label="Taux check-in"
          value={`${checkinRate}%`}
        />
      </div>

      {/* Sales chart */}
      <SalesChart data={chartData} />

      {/* Quota bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700">
            Quota mensuel — plan {org.plan.name}
          </h2>
          <span className="text-sm font-semibold text-gray-900">
            {quotaUsed} / {quotaTotal} tickets offerts
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              quotaUsed >= quotaTotal ? "bg-red-500" : quotaUsed >= quotaTotal * 0.8 ? "bg-amber-500" : "bg-violet-500"
            }`}
            style={{ width: `${Math.min(100, (quotaUsed / quotaTotal) * 100)}%` }}
            role="progressbar"
            aria-valuenow={quotaUsed}
            aria-valuemin={0}
            aria-valuemax={quotaTotal}
          />
        </div>
        {quotaUsed >= quotaTotal && (
          <p className="text-xs text-red-600 mt-2">
            Quota atteint. La commission de {org.plan.commissionRate * 100}% s&apos;applique sur les tickets supplémentaires.{" "}
            <a href={`/dashboard/${orgSlug}/billing`} className="underline">
              Passer en Pro
            </a>
          </p>
        )}
      </div>

      {/* Activity feed */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Activité récente</h2>
        </div>
        {recentActivity.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-400">Aucune activité pour le moment.</p>
            <a
              href={`/dashboard/${orgSlug}/events/new`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-violet-600 font-medium hover:underline"
            >
              Créer votre premier événement
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentActivity.map((order) => (
              <li key={order.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    order.status === "COMPLETED" ? "bg-green-100" : "bg-red-100"
                  }`}>
                    {order.status === "COMPLETED" ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 2 2 2-2 2 2 2-2 4 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {order.status === "COMPLETED" ? "Achat" : "Remboursement"} — {order.event.title}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {order.buyerFirstName} {order.buyerLastName} · {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-semibold flex-shrink-0 ${
                  order.status === "COMPLETED" ? "text-gray-900" : "text-red-600"
                }`}>
                  {order.status === "COMPLETED" ? "+" : "-"}{((order.totalCents - order.feesCents) / 100).toFixed(2)}€
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1.5">{value}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 font-medium ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
          {change >= 0 ? "+" : ""}{change.toFixed(1)}% vs période préc.
        </p>
      )}
    </div>
  );
}
