import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called daily — downgrades orgs past_due for 7+ days
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find orgs that are past_due and subscription ends more than 7 days ago
  const orgs = await db.organization.findMany({
    where: {
      subscriptionStatus: "PAST_DUE",
      subscriptionEndsAt: { lte: sevenDaysAgo },
    },
    include: {
      members: {
        where: { role: { permissions: { has: "BILLING_MANAGE" } } },
        include: { user: { select: { email: true, name: true } } },
      },
    },
  });

  let downgraded = 0;

  for (const org of orgs) {
    await db.organization.update({
      where: { id: org.id },
      data: {
        planId: "free",
        subscriptionStatus: "CANCELED",
        stripeSubscriptionId: null,
      },
    });

    // Notify billing admins
    for (const member of org.members) {
      if (!member.user.email) continue;
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: member.user.email,
          subject: "Votre abonnement Evoly Pro a été annulé",
          html: `
            <p>Bonjour ${member.user.name ?? ""},</p>
            <p>Suite à plusieurs tentatives de prélèvement infructueuses, votre organisation <strong>${org.name}</strong> a été rétrogradée au plan Free.</p>
            <p>Vos données et événements sont conservés. Pour réactiver le plan Pro, rendez-vous dans votre <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${org.slug}/billing">espace billing</a>.</p>
            <p>L'équipe Evoly</p>
          `,
        });
      } catch (e) {
        console.error(`[cron/downgrade-unpaid] Email error for ${member.user.email}:`, e);
      }
    }

    downgraded++;
  }

  console.log(`[cron/downgrade-unpaid] Downgraded ${downgraded} organizations`);

  return NextResponse.json({ downgraded });
  } catch (err) {
    console.error("[cron/downgrade-unpaid] Error:", err);
    captureException(err, { cron: "downgrade-unpaid" });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
