import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { EventSettingsForm } from "@/components/events/EventSettingsForm";

export default async function EventSettingsPage({
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
  });
  if (!event) redirect(`/dashboard/${orgSlug}/events`);

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });

  const canEdit = membership?.role.permissions.includes("EVENTS_EDIT") ?? false;

  return (
    <div className="p-6 max-w-2xl">
      <EventSettingsForm
        event={{
          id: event.id,
          title: event.title,
          description: event.description ?? "",
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt?.toISOString() ?? null,
          timezone: event.timezone,
          refundPolicy: event.refundPolicy,
          refundDeadlineDays: event.refundDeadlineDays ?? null,
          visibility: event.visibility,
          confirmationMessage: event.confirmationMessage ?? "",
          status: event.status,
        }}
        organizationId={org.id}
        orgSlug={orgSlug}
        eventSlug={eventSlug}
        canEdit={canEdit}
      />
    </div>
  );
}
