import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@evoly/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notifications?orgSlug=xxx&unreadOnly=true
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const orgSlug = searchParams.get("orgSlug");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  if (!orgSlug) return NextResponse.json({ error: "orgSlug manquant" }, { status: 400 });

  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return NextResponse.json({ error: "Org introuvable" }, { status: 404 });

  // Verify membership
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const notifications = await (db as any).notification.findMany({
    where: {
      organizationId: org.id,
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const unreadCount = unreadOnly
    ? notifications.length
    : await (db as any).notification.count({ where: { organizationId: org.id, read: false } });

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications — mark all as read
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { orgSlug, notificationId } = await req.json();

  if (!orgSlug) return NextResponse.json({ error: "orgSlug manquant" }, { status: 400 });

  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return NextResponse.json({ error: "Org introuvable" }, { status: 404 });

  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  if (notificationId) {
    // Mark single notification as read
    await (db as any).notification.updateMany({
      where: { id: notificationId, organizationId: org.id },
      data: { read: true },
    });
  } else {
    // Mark all as read
    await (db as any).notification.updateMany({
      where: { organizationId: org.id, read: false },
      data: { read: true },
    });
  }

  return NextResponse.json({ success: true });
}
