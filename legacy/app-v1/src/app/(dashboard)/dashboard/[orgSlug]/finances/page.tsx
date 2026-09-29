import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { FinancesPanel } from "@/components/finances/FinancesPanel";

export default async function FinancesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) redirect("/dashboard");

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("FINANCE_VIEW")) redirect(`/dashboard/${orgSlug}`);

  const canManage = membership.role.permissions.includes("FINANCE_MANAGE");

  // Payouts
  const payouts = await db.payout.findMany({
    where: { organizationId: org.id },
    orderBy: { requestedAt: "desc" },
    take: 20,
  });

  // Pending refunds
  const pendingRefunds = await db.refundRequest.findMany({
    where: {
      status: "PENDING",
      order: { event: { organizationId: org.id } },
    },
    include: {
      order: {
        include: { event: { select: { title: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  // Next reserve releases
  const nextReleases = await db.reserve.findMany({
    where: { organizationId: org.id, status: "HELD" },
    orderBy: { releasesAt: "asc" },
    take: 5,
  });

  return (
    <div className="p-6">
      <FinancesPanel
        org={{
          id: org.id,
          slug: org.slug,
          availableBalanceCents: org.availableBalanceCents,
          reservedBalanceCents: org.reservedBalanceCents,
          stripeAccountStatus: org.stripeAccountStatus,
          stripeAccountId: org.stripeAccountId,
        }}
        payouts={payouts.map((p) => ({
          id: p.id,
          amountCents: p.amountCents,
          status: p.status,
          requestedAt: p.requestedAt.toISOString(),
          paidAt: p.paidAt?.toISOString() ?? null,
          failureReason: p.failureReason,
        }))}
        pendingRefunds={pendingRefunds.map((r) => ({
          id: r.id,
          orderId: r.orderId,
          eventTitle: r.order.event.title,
          buyerName: `${r.order.buyerFirstName} ${r.order.buyerLastName}`,
          buyerEmail: r.order.buyerEmail,
          amountCents: r.order.totalCents,
          reason: r.reason,
          isOutOfDeadline: r.isOutOfDeadline,
          createdAt: r.createdAt.toISOString(),
        }))}
        nextReleases={nextReleases.map((r) => ({
          id: r.id,
          amountCents: r.amountCents,
          releasesAt: r.releasesAt.toISOString(),
        }))}
        canManage={canManage}
      />
    </div>
  );
}
