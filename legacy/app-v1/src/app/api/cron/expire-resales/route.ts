import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every 5 minutes — expires overdue resale links
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Expire OPEN resale links past their expiry date
    const expired = await db.resaleLink.updateMany({
      where: {
        status: "OPEN",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED" },
    });

    // Also expire PENDING links older than 30 minutes (payment abandoned)
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const abandonedPending = await db.resaleLink.updateMany({
      where: {
        status: "PENDING",
        updatedAt: { lte: thirtyMinutesAgo },
      },
      data: { status: "OPEN" }, // back to OPEN so another buyer can try
    });

    console.log(
      `[cron/expire-resales] Expired: ${expired.count}, Reset pending: ${abandonedPending.count}`
    );

    return NextResponse.json({
      expired: expired.count,
      resetPending: abandonedPending.count,
    });
  } catch (err) {
    console.error("[cron/expire-resales] Error:", err);
    captureException(err, { cron: "expire-resales" });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
