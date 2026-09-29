import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token manquant." }, { status: 400 });

  const scannerLink = await db.scannerLink.findUnique({
    where: { token },
    include: {
      event: {
        include: {
          ticketTypes: { select: { id: true, name: true } },
          _count: { select: { orders: true } },
        },
      },
    },
  });

  if (!scannerLink || scannerLink.revokedAt || scannerLink.expiresAt < new Date()) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 403 });
  }

  const event = scannerLink.event;

  const tickets = await db.ticket.findMany({
    where: { order: { eventId: event.id } },
    select: { id: true, checkedIn: true, status: true, order: { select: { items: { select: { ticketTypeId: true, quantity: true } } } } },
  });

  const total = tickets.length;
  const checkedIn = tickets.filter((t: (typeof tickets)[number]) => t.checkedIn).length;

  // Per ticket type breakdown
  const breakdown: Record<string, { name: string; total: number; checkedIn: number }> = {};
  for (const tt of event.ticketTypes) {
    breakdown[tt.id] = { name: tt.name, total: 0, checkedIn: 0 };
  }

  // Recent check-ins
  const recentCheckIns = await db.ticket.findMany({
    where: { order: { eventId: event.id }, checkedIn: true },
    orderBy: { checkedInAt: "desc" },
    take: 20,
    select: {
      id: true,
      holderFirstName: true,
      holderLastName: true,
      checkedInAt: true,
    },
  });

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
    },
    stats: {
      total,
      checkedIn,
      rate: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
    },
    recentCheckIns: recentCheckIns.map((t: (typeof recentCheckIns)[number]) => ({
      id: t.id,
      name: `${t.holderFirstName ?? ""} ${t.holderLastName ?? ""}`.trim() || "Anonyme",
      checkedInAt: t.checkedInAt?.toISOString(),
    })),
  });
}
