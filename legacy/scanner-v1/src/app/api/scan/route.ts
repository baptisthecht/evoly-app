import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";

export async function POST(req: NextRequest) {
  const { qrCode, token } = await req.json();

  if (!qrCode || !token) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }

  // Validate scanner link
  const scannerLink = await db.scannerLink.findUnique({
    where: { token },
    include: { event: { select: { id: true, title: true } } },
  });

  if (!scannerLink) {
    return NextResponse.json({ result: "INVALID_SCANNER", message: "Lien scanner invalide." }, { status: 403 });
  }
  if (scannerLink.revokedAt) {
    return NextResponse.json({ result: "INVALID_SCANNER", message: "Ce lien a été révoqué." }, { status: 403 });
  }
  if (scannerLink.expiresAt < new Date()) {
    return NextResponse.json({ result: "INVALID_SCANNER", message: "Ce lien a expiré." }, { status: 403 });
  }

  // Find ticket
  const ticket = await db.ticket.findUnique({
    where: { qrCode },
    include: {
      order: {
        include: {
          event: { select: { id: true, title: true } },
          items: true,
        },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json({ result: "INVALID", message: "Billet invalide." });
  }

  // Wrong event
  if (ticket.order.event.id !== scannerLink.event.id) {
    return NextResponse.json({
      result: "WRONG_EVENT",
      message: `Billet pour un autre événement : "${ticket.order.event.title}"`,
    });
  }

  // Already scanned
  if (ticket.checkedIn) {
    return NextResponse.json({
      result: "ALREADY_SCANNED",
      message: `Déjà scanné à ${ticket.checkedInAt ? new Date(ticket.checkedInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "?"}`,
      ticket: {
        holderName: `${ticket.holderFirstName ?? ""} ${ticket.holderLastName ?? ""}`.trim(),
        checkedInAt: ticket.checkedInAt?.toISOString(),
      },
    });
  }

  // Cancelled/refunded
  if (ticket.status !== "ACTIVE") {
    return NextResponse.json({
      result: "INVALID",
      message: `Billet ${ticket.status === "REFUNDED" ? "remboursé" : "annulé"}.`,
    });
  }

  // ✅ Check in
  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      checkedIn: true,
      checkedInAt: new Date(),
      checkedInBy: scannerLink.id,
      status: "USED",
    },
  });

  // Update last used
  await db.scannerLink.update({
    where: { id: scannerLink.id },
    data: { lastUsedAt: new Date() },
  });

  return NextResponse.json({
    result: "VALID",
    message: "Billet valide ✓",
    ticket: {
      holderName: `${ticket.holderFirstName ?? ""} ${ticket.holderLastName ?? ""}`.trim() || "Anonyme",
      holderEmail: ticket.holderEmail,
    },
  });
}
