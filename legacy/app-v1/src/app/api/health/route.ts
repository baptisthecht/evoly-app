import { NextResponse } from "next/server";
import { db } from "@evoly/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { status: "ok" | "error"; latencyMs?: number; error?: string }> = {};

  // DB check
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - start };
  } catch (err: any) {
    checks.database = { status: "error", error: err.message };
  }

  // Stripe check (env var presence only — don't make API calls in health)
  checks.stripe = {
    status: process.env.STRIPE_SECRET_KEY ? "ok" : "error",
    ...(process.env.STRIPE_SECRET_KEY ? {} : { error: "STRIPE_SECRET_KEY missing" }),
  };

  // Resend check
  checks.resend = {
    status: process.env.RESEND_API_KEY ? "ok" : "error",
    ...(process.env.RESEND_API_KEY ? {} : { error: "RESEND_API_KEY missing" }),
  };

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const totalMs = Date.now() - start;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      latencyMs: totalMs,
      checks,
      version: process.env.npm_package_version ?? "unknown",
    },
    { status: allOk ? 200 : 503 }
  );
}
