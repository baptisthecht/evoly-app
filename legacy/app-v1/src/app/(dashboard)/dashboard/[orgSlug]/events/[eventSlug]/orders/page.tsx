import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { OrdersManager } from "@/components/events/OrdersManager";

export default async function EventOrdersPage({
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
  const canRefund = membership?.role.permissions.includes("TICKETS_REFUND") ?? false;

  const orders = await db.order.findMany({
    where: { eventId: event.id },
    include: {
      tickets: { select: { id: true, status: true, checkedIn: true, qrCode: true } },
      items: true,
      refundRequests: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6">
      <OrdersManager
        organizationId={org.id}
        canRefund={canRefund}
        orders={orders.map((o) => ({
          id: o.id,
          buyerFirstName: o.buyerFirstName,
          buyerLastName: o.buyerLastName,
          buyerEmail: o.buyerEmail,
          totalCents: o.totalCents,
          feesCents: o.feesCents,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          ticketCount: o.tickets.length,
          checkedInCount: o.tickets.filter((t) => t.checkedIn).length,
          magicToken: o.magicToken,
          refundRequests: o.refundRequests.map((r) => ({
            id: r.id,
            status: r.status,
            ticketIds: r.ticketIds,
            reason: r.reason,
            isOutOfDeadline: r.isOutOfDeadline,
            responseMessage: r.responseMessage,
            createdAt: r.createdAt.toISOString(),
          })),
        }))}
      />
    </div>
  );
}
