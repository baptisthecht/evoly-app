import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { PromoCodesManager } from "@/components/events/PromoCodesManager";

export default async function EventPromoPage({
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
      promoCodes: { orderBy: { createdAt: "desc" } },
      ticketTypes: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!event) redirect(`/dashboard/${orgSlug}/events`);

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });

  const canEdit = membership?.role.permissions.includes("EVENTS_EDIT") ?? false;

  return (
    <div className="p-6">
      <PromoCodesManager
        eventId={event.id}
        organizationId={org.id}
        promoCodes={event.promoCodes}
        ticketTypes={event.ticketTypes.map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents }))}
        canEdit={canEdit}
      />
    </div>
  );
}
