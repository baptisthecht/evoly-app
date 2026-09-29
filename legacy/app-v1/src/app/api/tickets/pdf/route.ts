import { NextRequest, NextResponse } from "next/server";
import { db } from "@evoly/db";
import { generateQrDataUrl } from "@/lib/qrcode";

export const runtime = "nodejs";

// GET /api/tickets/pdf?token=[magicToken]&ticketId=[optional]
// Returns a PDF for one or all tickets of an order
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const magicToken = searchParams.get("token");
  const ticketId = searchParams.get("ticketId");

  if (!magicToken) {
    return NextResponse.json({ error: "Token manquant." }, { status: 400 });
  }

  const order = await db.order.findUnique({
    where: { magicToken },
    include: {
      event: {
        include: {
          organization: { select: { name: true, logoUrl: true, planId: true, brand: { select: { primaryColor: true, logoUrl: true, brandName: true } } } },
        },
      },
      tickets: {
        where: ticketId ? { id: ticketId } : { status: { in: ["ACTIVE", "USED"] } },
        include: { seat: true },
      },
      items: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }

  const { event } = order;
  const tickets = order.tickets;

  if (tickets.length === 0) {
    return NextResponse.json({ error: "Aucun billet disponible." }, { status: 404 });
  }

  // Generate QR data URLs for each ticket
  const ticketsWithQr = await Promise.all(
    tickets.map(async (ticket) => {
      const qrDataUrl = await generateQrDataUrl(ticket.qrCode);
      return { ...ticket, qrDataUrl };
    })
  );

  // Build PDF HTML (rendered server-side, returned as PDF via browser print)
  const eventDate = new Date(event.startsAt).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const isPro = event.organization.planId === "pro";
  const orgBrand = event.organization.brand as { primaryColor?: string | null; logoUrl?: string | null; brandName?: string | null } | null;
  const brandName = orgBrand?.brandName ?? (isPro ? event.organization.name : "Evoly");
  const brandColor = orgBrand?.primaryColor ?? "#7c3aed";
  const brandLogo = orgBrand?.logoUrl ?? event.organization.logoUrl;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Billets — ${event.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }
    .page { max-width: 600px; margin: 0 auto; padding: 24px; }
    .ticket {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      page-break-inside: avoid;
    }
    .ticket-header {
      background: ${brandColor};
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ticket-header .brand { color: white; font-size: 18px; font-weight: 700; }
    .ticket-header .brand-logo { height: 28px; width: auto; }
    .ticket-header .type { color: rgba(255,255,255,0.8); font-size: 12px; }
    .ticket-body { padding: 24px; display: flex; gap: 20px; }
    .ticket-info { flex: 1; }
    .event-title { font-size: 18px; font-weight: 700; color: #111; margin-bottom: 12px; line-height: 1.3; }
    .info-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
    .info-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
    .info-text { font-size: 13px; color: #374151; line-height: 1.4; }
    .info-label { font-size: 11px; color: #9ca3af; display: block; margin-bottom: 1px; }
    .holder-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid #f3f4f6; }
    .holder-name { font-size: 15px; font-weight: 600; color: #111; }
    .holder-email { font-size: 12px; color: #6b7280; }
    .qr-section { flex-shrink: 0; text-align: center; }
    .qr-section img { width: 110px; height: 110px; display: block; }
    .qr-label { font-size: 10px; color: #9ca3af; margin-top: 4px; }
    .ticket-footer {
      padding: 12px 24px;
      background: #f9fafb;
      border-top: 1px solid #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .order-id { font-size: 11px; color: #9ca3af; font-family: monospace; }
    .seat-badge {
      font-size: 11px; font-weight: 600; color: ${brandColor};
      background: ${brandColor}15; padding: 2px 8px; border-radius: 6px;
    }
    .perfo { height: 1px; background: repeating-linear-gradient(to right, #e5e7eb 0, #e5e7eb 8px, transparent 8px, transparent 16px); }
    @media print {
      body { background: white; }
      .page { padding: 0; }
      .ticket { box-shadow: none; border: 1px solid #e5e7eb; }
    }
    @page { margin: 20mm; }
  </style>
</head>
<body>
  <div class="page">
    ${ticketsWithQr.map((ticket, i) => `
    <div class="ticket">
      <div class="ticket-header">
        <div>
          <div class="brand">${brandName}</div>
          <div class="type">Billet #${i + 1}${tickets.length > 1 ? ` sur ${tickets.length}` : ""}</div>
        </div>
        ${isPro && event.organization.logoUrl ? `<img src="${event.organization.logoUrl}" alt="" style="height:32px;opacity:0.9">` : ""}
      </div>
      <div class="ticket-body">
        <div class="ticket-info">
          <div class="event-title">${event.title}</div>
          <div class="info-row">
            <span class="info-icon">📅</span>
            <span class="info-text">${eventDate}</span>
          </div>
          ${event.locationName ? `
          <div class="info-row">
            <span class="info-icon">📍</span>
            <span class="info-text">${event.locationName}${event.locationAddress ? `<br><span style="color:#9ca3af;font-size:12px">${event.locationAddress}</span>` : ""}</span>
          </div>` : ""}
          ${ticket.holderFirstName ? `
          <div class="holder-section">
            <span class="info-label">Titulaire</span>
            <div class="holder-name">${ticket.holderFirstName} ${ticket.holderLastName ?? ""}</div>
            ${ticket.holderEmail ? `<div class="holder-email">${ticket.holderEmail}</div>` : ""}
          </div>` : `
          <div class="holder-section">
            <span class="info-label">Acheteur</span>
            <div class="holder-name">${order.buyerFirstName} ${order.buyerLastName}</div>
          </div>`}
        </div>
        <div class="qr-section">
          <img src="${ticket.qrDataUrl}" alt="QR Code billet">
          <div class="qr-label">Scanner à l'entrée</div>
        </div>
      </div>
      <div class="perfo"></div>
      <div class="ticket-footer">
        <span class="order-id">CMD-${order.id.slice(-8).toUpperCase()}</span>
        ${ticket.seat ? `<span class="seat-badge">📍 ${ticket.seat.label}</span>` : ""}
        ${ticket.status === "USED" ? `<span style="font-size:11px;color:#059669;font-weight:600">✓ Utilisé</span>` : ""}
      </div>
    </div>
    `).join("")}
  </div>
  <script>
    // Auto-print when opened directly
    if (window.location.search.includes('print=1')) {
      window.addEventListener('load', () => window.print());
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache",
    },
  });
}
