import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called on 1st of each month at 00:01
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const result = await db.organization.updateMany({
      data: {
        ticketsSoldThisMonth: 0,
        quotaResetAt: nextReset,
      },
    });

    console.log(`[cron/reset-quota] Reset quota for ${result.count} organizations`);

    return NextResponse.json({ reset: result.count });
  } catch (err) {
    console.error("[cron/reset-quota] Error:", err);
    captureException(err, { cron: "reset-quota" });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
