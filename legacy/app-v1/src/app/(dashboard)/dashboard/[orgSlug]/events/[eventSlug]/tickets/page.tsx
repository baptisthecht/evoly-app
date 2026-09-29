import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { TicketsManager } from "@/components/events/TicketsManager";

export default async function EventTicketsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug, eventSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, stripeAccountStatus: true },
  });
  if (!org) redirect("/dashboard");

  const event = await db.event.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: eventSlug } },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
  });
  if (!event) redirect(`/dashboard/${orgSlug}/events`);

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership) redirect("/dashboard");

  const canEdit = membership.role.permissions.includes("EVENTS_EDIT");
  const stripeConnected = org.stripeAccountStatus === "ACTIVE";

  return (
    <div className="p-6">
      <TicketsManager
        event={{ id: event.id, status: event.status }}
        ticketTypes={event.ticketTypes}
        organizationId={org.id}
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        canEdit={canEdit}
        stripeConnected={stripeConnected}
      />
    </div>
  );
}
