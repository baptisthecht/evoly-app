import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ipFrom } from "./requestInfo";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Journal d'audit des actions sensibles (section 13.1). N'y mettre aucune donnée de paiement. */
export async function audit(entry: {
  action: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType?: "USER" | "SYSTEM" | "SCANNER" | "ADMIN" | "STRIPE";
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, Json>;
}): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = ipFrom(h);
    userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    // appelé hors requête (tâche de fond, webhook)
  }
  await db.auditLog.create({
    data: {
      action: entry.action,
      organizationId: entry.organizationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType ?? (entry.actorUserId ? "USER" : "SYSTEM"),
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? undefined,
      ip,
      userAgent,
    },
  });
}
