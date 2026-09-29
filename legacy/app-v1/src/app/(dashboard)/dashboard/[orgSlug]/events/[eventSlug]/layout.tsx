import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import Link from "next/link";
import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { EventActionButtons } from "@/components/events/EventActionButtons";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership) redirect("/dashboard");

  const permissions = membership.role.permissions;

  const tabs = [
    { href: `/dashboard/${orgSlug}/events/${eventSlug}`, label: "Aperçu", exact: true },
    { href: `/dashboard/${orgSlug}/events/${eventSlug}/tickets`, label: "Tickets" },
    ...(event.seatingType === "ASSIGNED" ? [{ href: `/dashboard/${orgSlug}/events/${eventSlug}/seating`, label: "Plan de salle" }] : []),
    { href: `/dashboard/${orgSlug}/events/${eventSlug}/orders`, label: "Commandes" },
    { href: `/dashboard/${orgSlug}/events/${eventSlug}/checkin`, label: "Check-in" },
    { href: `/dashboard/${orgSlug}/events/${eventSlug}/promo`, label: "Codes promo" },
    { href: `/dashboard/${orgSlug}/events/${eventSlug}/emails`, label: "Emails" },
    { href: `/dashboard/${orgSlug}/events/${eventSlug}/settings`, label: "Paramètres" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Event header */}
      <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-0">
        <div className="max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
            <Link href={`/dashboard/${orgSlug}/events`} className="hover:text-gray-600">
              Événements
            </Link>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-700 font-medium truncate max-w-[200px]">{event.title}</span>
          </div>

          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <EventStatusBadge status={event.status} />
                <span className="text-xs text-gray-400">
                  {new Date(event.startsAt).toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <h1 className="text-xl font-bold text-gray-900 truncate">{event.title}</h1>
            </div>

            <EventActionButtons
              event={{ id: event.id, status: event.status, slug: event.slug }}
              organizationId={org.id}
              orgSlug={orgSlug}
              permissions={permissions as string[]}
            />
          </div>

          {/* Tabs */}
          <nav className="flex gap-0 -mb-px overflow-x-auto" aria-label="Onglets événement">
            {tabs.map((tab) => (
              <TabLink key={tab.href} {...tab} />
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function TabLink({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  // Since this is a server component, we pass active detection to a client wrapper
  return (
    <Link
      href={href}
      className="px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 transition-colors whitespace-nowrap"
    >
      {label}
    </Link>
  );
}
