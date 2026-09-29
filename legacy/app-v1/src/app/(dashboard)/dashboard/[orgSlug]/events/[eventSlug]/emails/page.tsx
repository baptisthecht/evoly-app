import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { EmailsManager } from "@/components/emails/EmailsManager";

export default async function EmailsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug, eventSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, planId: true, slug: true },
  });
  if (!org) redirect("/dashboard");

  const event = await db.event.findUnique({
    where: { organizationId_slug: { organizationId: org.id, slug: eventSlug } },
    select: { id: true, title: true, slug: true, status: true },
  });
  if (!event) redirect(`/dashboard/${orgSlug}/events`);

  const isPro = org.planId === "pro";

  // Load automations — auto-init if event is published and none exist yet
  let automations = await db.emailAutomation.findMany({
    where: { eventId: event.id },
    orderBy: { type: "asc" },
  });

  if (automations.length === 0 && event.status === "PUBLISHED") {
    const defaultAutomations = [
      { type: "REMINDER_J7" as const, enabled: true },
      { type: "REMINDER_J1" as const, enabled: true },
      { type: "REMINDER_J0" as const, enabled: true },
      { type: "POST_EVENT" as const, enabled: false },
      { type: "LAST_TICKETS" as const, enabled: false },
    ];
    await db.emailAutomation.createMany({
      data: defaultAutomations.map((a) => ({
        eventId: event.id,
        type: a.type,
        enabled: a.enabled,
        content: {},
      })),
    });
    automations = await db.emailAutomation.findMany({
      where: { eventId: event.id },
      orderBy: { type: "asc" },
    });
  }

  // Load campaigns
  const campaigns = await db.emailCampaign.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Buyer count (for recipient estimation)
  const buyerCount = await db.order.count({
    where: { eventId: event.id, status: "COMPLETED" },
  });

  return (
    <div className="p-6">
      <EmailsManager
        org={{ id: org.id, planId: org.planId, slug: org.slug }}
        event={{ id: event.id, title: event.title, slug: event.slug, status: event.status }}
        isPro={isPro}
        automations={automations.map((a) => ({
          id: a.id,
          type: a.type,
          enabled: a.enabled,
          lastSentAt: a.lastSentAt?.toISOString() ?? null,
          content: a.content as object,
        }))}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          subject: c.subject,
          status: c.status,
          scheduledAt: c.scheduledAt?.toISOString() ?? null,
          sentAt: c.sentAt?.toISOString() ?? null,
          recipientCount: c.recipientCount,
          openCount: c.openCount,
          clickCount: c.clickCount,
          unsubscribeCount: c.unsubscribeCount,
        }))}
        buyerCount={buyerCount}
      />
    </div>
  );
}
