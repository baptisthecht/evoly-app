import { db } from "@evoly/db";
import { notFound } from "next/navigation";
import { RefundRequestForm } from "./RefundRequestForm";

export default async function RefundPage({
  params,
}: {
  params: Promise<{ magicToken: string }>;
}) {
  const { magicToken } = await params;

  const order = await db.order.findUnique({
    where: { magicToken },
    include: {
      event: {
        select: {
          title: true, startsAt: true, refundPolicy: true, refundDeadlineDays: true,
          organization: { select: { name: true } },
        },
      },
      tickets: {
        where: { status: "ACTIVE" },
        select: { id: true, qrCode: true, holderFirstName: true, holderLastName: true },
      },
      refundRequests: {
        where: { status: { in: ["PENDING", "APPROVED", "PROCESSED"] } },
        select: { id: true, status: true, ticketIds: true },
      },
    },
  });

  if (!order) notFound();
  if (order.status !== "COMPLETED") notFound();

  const event = order.event;

  // Determine if refund is allowed
  const now = new Date();
  const eventStart = new Date(event.startsAt);
  let canRefund = false;
  let refundReason = "";

  if (event.refundPolicy === "NON_REFUNDABLE") {
    refundReason = "Cet événement ne propose pas de remboursements.";
  } else if (event.refundPolicy === "ALWAYS_REFUNDABLE") {
    canRefund = true;
  } else if (event.refundPolicy === "ORGANIZER_DEFINED" && event.refundDeadlineDays !== null) {
    const deadline = new Date(eventStart.getTime() - event.refundDeadlineDays * 24 * 60 * 60 * 1000);
    if (now > deadline) {
      refundReason = `La date limite de remboursement (${event.refundDeadlineDays} jours avant l'événement) est dépassée.`;
    } else {
      canRefund = true;
    }
  }

  // Tickets already in a pending/approved refund request
  const refundedTicketIds = new Set(order.refundRequests.flatMap(r => r.ticketIds));
  const refundableTickets = order.tickets.filter(t => !refundedTicketIds.has(t.id));

  const isOutOfDeadline = !canRefund && event.refundPolicy !== "NON_REFUNDABLE";

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="font-bold text-violet-600 text-lg">evoly</span>
          <span className="text-sm text-gray-500">{event.organization.name}</span>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h1 className="text-base font-bold text-gray-900">Demande de remboursement</h1>
          <p className="text-sm text-gray-600 mt-1">{event.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(event.startsAt).toLocaleDateString("fr-FR", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>

        <RefundRequestForm
          orderId={order.id}
          magicToken={magicToken}
          canRefund={canRefund}
          isOutOfDeadline={isOutOfDeadline}
          refundReason={refundReason}
          tickets={refundableTickets.map(t => ({
            id: t.id,
            label: t.holderFirstName
              ? `${t.holderFirstName} ${t.holderLastName ?? ""}`
              : `Billet ${t.qrCode.slice(-6).toUpperCase()}`,
          }))}
          existingRequests={order.refundRequests.map(r => ({ status: r.status, count: r.ticketIds.length }))}
        />
      </div>
    </div>
  );
}
