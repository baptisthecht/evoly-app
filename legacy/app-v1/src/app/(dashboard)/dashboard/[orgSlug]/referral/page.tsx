import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@evoly/db";
import { ReferralDashboard } from "@/components/referral/ReferralDashboard";

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { orgSlug } = await params;

  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, slug: true, name: true, planId: true },
  });
  if (!org) redirect("/dashboard");

  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: org.id, userId: session.user.id },
    },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("BILLING_MANAGE")) {
    redirect(`/dashboard/${orgSlug}`);
  }

  // Get or create referral code
  let referral = await db.referral.findFirst({
    where: { referrerOrgId: org.id },
    orderBy: { createdAt: "asc" },
  });

  if (!referral) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const base = org.slug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 12);
    referral = await db.referral.create({
      data: {
        referrerOrgId: org.id,
        code: `${base}-${suffix}`,
      },
    });
  }

  // Get stats
  const allReferrals = await db.referral.findMany({
    where: { referrerOrgId: org.id },
    include: { referredOrg: { select: { name: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

  return (
    <div className="p-6 max-w-2xl">
      <ReferralDashboard
        organizationId={org.id}
        orgSlug={org.slug}
        referralCode={referral.code}
        referralUrl={`${appUrl}/register?ref=${referral.code}`}
        referrals={allReferrals.map((r) => ({
          id: r.id,
          status: r.status,
          rewardGrantedAt: r.rewardGrantedAt?.toISOString() ?? null,
          referredOrgName: r.referredOrg?.name ?? null,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
