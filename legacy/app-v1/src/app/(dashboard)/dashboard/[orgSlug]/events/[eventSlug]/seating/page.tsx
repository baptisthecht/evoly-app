import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { SeatingMapManager } from "@/components/events/SeatingMapManager";

export default async function EventSeatingPage({
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
      seatingMap: {
        include: {
          categories: { include: { seats: true } },
          rows: { include: { seats: true }, orderBy: { sortOrder: "asc" } },
        },
      },
      ticketTypes: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (!event) redirect(`/dashboard/${orgSlug}/events`);
  if (event.seatingType !== "ASSIGNED") redirect(`/dashboard/${orgSlug}/events/${eventSlug}/tickets`);

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("EVENTS_EDIT")) redirect(`/dashboard/${orgSlug}`);

  return (
    <div className="p-6">
      <SeatingMapManager
        eventId={event.id}
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        allowSeatChoice={event.allowSeatChoice}
        seatingMap={event.seatingMap ? {
          id: event.seatingMap.id,
          categories: event.seatingMap.categories.map(c => ({
            id: c.id,
            name: c.name,
            color: c.color,
            ticketTypeId: c.ticketTypeId,
            seatCount: c.seats.length,
            soldCount: c.seats.filter(s => s.status === "SOLD").length,
          })),
          rows: event.seatingMap.rows.map(r => ({
            id: r.id,
            categoryId: r.categoryId,
            name: r.name,
            sortOrder: r.sortOrder,
            seats: r.seats.map(s => ({
              id: s.id,
              label: s.label,
              status: s.status,
            })),
          })),
        } : null}
        ticketTypes={event.ticketTypes.map(tt => ({
          id: tt.id,
          name: tt.name,
          priceCents: tt.priceCents,
        }))}
      />
    </div>
  );
}
