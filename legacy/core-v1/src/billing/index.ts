import { db } from "@evoly/db";

// Reserved slugs that cannot be used as subdomains/org slugs
export const RESERVED_SLUGS = [
  "app",
  "api",
  "www",
  "scanner",
  "admin",
  "mail",
  "support",
  "blog",
  "help",
  "docs",
  "status",
  "evoly",
  "auth",
  "login",
  "register",
];

/**
 * Calculate the commission amount in cents for a given transaction.
 * Commission is taken via Stripe application_fee_amount.
 */
export async function calculateCommission(
  organizationId: string,
  amountCents: number,
  ticketCount: number
): Promise<number> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: { plan: true },
  });

  const quota = org.plan.monthlyFreeQuota;
  const alreadySold = org.ticketsSoldThisMonth;

  // How many of the new tickets fall within the free quota
  const freeCount = Math.max(0, quota - alreadySold);
  const paidCount = Math.max(0, ticketCount - freeCount);

  if (paidCount === 0) return 0;

  // Apply commission only on paid tickets (proportionally to their value)
  const pricePerTicket = amountCents / ticketCount;
  const commissionableAmount = Math.round(paidCount * pricePerTicket);

  return Math.round(commissionableAmount * org.plan.commissionRate);
}

/**
 * Increment the monthly sold ticket counter for an organization.
 */
export async function incrementTicketQuota(
  organizationId: string,
  count: number
): Promise<void> {
  await db.organization.update({
    where: { id: organizationId },
    data: {
      ticketsSoldThisMonth: { increment: count },
    },
  });
}

/**
 * Reset the monthly quota (called by cron job on 1st of each month).
 */
export async function resetMonthlyQuota(organizationId: string): Promise<void> {
  await db.organization.update({
    where: { id: organizationId },
    data: {
      ticketsSoldThisMonth: 0,
      quotaResetAt: new Date(),
    },
  });
}

/**
 * Check if an organization is on Pro plan.
 */
export async function isProPlan(organizationId: string): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { planId: true, subscriptionStatus: true },
  });

  if (!org) return false;

  return (
    org.planId === "pro" &&
    (org.subscriptionStatus === "ACTIVE" ||
      org.subscriptionStatus === "TRIALING")
  );
}

/**
 * Seed the default plans into the database.
 * Should be called once during initial setup.
 */
export async function seedPlans(): Promise<void> {
  await db.plan.upsert({
    where: { id: "free" },
    create: {
      id: "free",
      name: "Free",
      commissionRate: 0.05,
      monthlyFreeQuota: 30,
      monthlyPriceCents: 0,
      yearlyPriceCents: 0,
    },
    update: {},
  });

  await db.plan.upsert({
    where: { id: "pro" },
    create: {
      id: "pro",
      name: "Pro",
      commissionRate: 0.025,
      monthlyFreeQuota: 150,
      monthlyPriceCents: 2900,
      yearlyPriceCents: 24900,
    },
    update: {},
  });
}
