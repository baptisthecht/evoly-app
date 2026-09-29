import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called daily — releases 20% reserves older than 30 days
// Secure with CRON_SECRET env var (set same value in Coolify cron config)
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
  const now = new Date();

  // Find all reserves due for release
  const reserves = await db.reserve.findMany({
    where: {
      status: "HELD",
      releasesAt: { lte: now },
    },
    include: {
      organization: { select: { id: true } },
    },
  });

  if (reserves.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  let released = 0;
  let totalCents = 0;

  await db.$transaction(async (tx) => {
    for (const reserve of reserves) {
      // Mark as released
      await tx.reserve.update({
        where: { id: reserve.id },
        data: { status: "RELEASED", releasedAt: now },
      });

      // Credit org available balance
      await tx.organization.update({
        where: { id: reserve.organizationId },
        data: { availableBalanceCents: { increment: reserve.amountCents } },
      });

      released++;
      totalCents += reserve.amountCents;
    }
  });

  console.log(`[cron/release-reserves] Released ${released} reserves, total ${totalCents / 100}€`);

  return NextResponse.json({ released, totalCents });
  } catch (err) {
    console.error("[cron/release-reserves] Error:", err);
    captureException(err, { cron: "release-reserves" });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
