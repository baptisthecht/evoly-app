import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { BillingPanel } from "@/components/billing/BillingPanel";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    include: { plan: true },
  });
  if (!org) redirect("/dashboard");

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("BILLING_MANAGE")) redirect(`/dashboard/${orgSlug}`);

  // Fetch invoices from Stripe if customer exists
  let invoices: { id: string; date: number; amount: number; status: string; pdf: string | null }[] = [];
  if (org.stripeCustomerId) {
    try {
      const { stripe } = await import("@/lib/stripe");
      const stripeInvoices = await stripe.invoices.list({
        customer: org.stripeCustomerId,
        limit: 12,
      });
      invoices = stripeInvoices.data.map((inv) => ({
        id: inv.id,
        date: inv.created,
        amount: inv.amount_paid,
        status: inv.status ?? "unknown",
        pdf: inv.invoice_pdf ?? null as string | null,
      }));
    } catch {}
  }

  return (
    <div className="p-6 max-w-2xl">
      <BillingPanel
        org={{
          id: org.id,
          slug: org.slug,
          planId: org.planId,
          subscriptionStatus: org.subscriptionStatus,
          trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
          subscriptionEndsAt: org.subscriptionEndsAt?.toISOString() ?? null,
          ticketsSoldThisMonth: org.ticketsSoldThisMonth,
          plan: {
            id: org.plan.id,
            name: org.plan.name,
            monthlyFreeQuota: org.plan.monthlyFreeQuota,
            commissionRate: org.plan.commissionRate,
            monthlyPriceCents: org.plan.monthlyPriceCents,
            yearlyPriceCents: org.plan.yearlyPriceCents,
          },
        }}
        invoices={invoices}
      />
    </div>
  );
}
