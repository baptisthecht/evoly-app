import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import Link from "next/link";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) redirect("/dashboard");

  const events = await db.event.findMany({
    where: { organizationId: org.id },
    include: {
      ticketTypes: { select: { priceCents: true, quantitySold: true, quantity: true } },
      _count: { select: { orders: true } },
    },
    orderBy: { startsAt: "desc" },
  });

  const statusLabel: Record<string, { label: string; classes: string }> = {
    DRAFT:     { label: "Brouillon",  classes: "bg-gray-100 text-gray-600" },
    PUBLISHED: { label: "Publié",     classes: "bg-green-100 text-green-700" },
    CANCELLED: { label: "Annulé",     classes: "bg-red-100 text-red-600" },
    ENDED:     { label: "Terminé",    classes: "bg-blue-100 text-blue-600" },
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Événements</h1>
          <p className="text-sm text-gray-500 mt-0.5">{events.length} événement{events.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href={`/dashboard/${orgSlug}/events/new`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvel événement
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m-6-2v2M7 5a2 2 0 00-2 2v11a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2H7z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Aucun événement</h2>
          <p className="text-sm text-gray-500 mb-6">Créez votre premier événement en moins de 60 secondes.</p>
          <Link
            href={`/dashboard/${orgSlug}/events/new`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Créer un événement
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const revenue = event.ticketTypes.reduce((acc, tt) => acc + tt.priceCents * tt.quantitySold, 0);
            const totalCapacity = event.ticketTypes.reduce((acc, tt) => acc + (tt.quantity ?? 0), 0);
            const totalSold = event.ticketTypes.reduce((acc, tt) => acc + tt.quantitySold, 0);
            const fillRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : null;
            const status = statusLabel[event.status];

            return (
              <Link
                key={event.id}
                href={`/dashboard/${orgSlug}/events/${event.slug}`}
                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-violet-200 hover:shadow-sm transition-all group"
              >
                {/* Banner thumbnail */}
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-violet-100 to-violet-200 flex-shrink-0 overflow-hidden">
                  {event.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={event.bannerUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m-6-2v2M7 5a2 2 0 00-2 2v11a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2H7z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.classes}`}>
                      {status.label}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-violet-700">
                    {event.title}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(event.startsAt).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {/* Stats — hidden on mobile */}
                <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{totalSold}</p>
                    <p className="text-xs text-gray-400">tickets</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{(revenue / 100).toFixed(0)}€</p>
                    <p className="text-xs text-gray-400">revenus</p>
                  </div>
                  {fillRate !== null && (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{fillRate}%</p>
                      <p className="text-xs text-gray-400">remplissage</p>
                    </div>
                  )}
                </div>

                <svg className="w-4 h-4 text-gray-300 group-hover:text-violet-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
