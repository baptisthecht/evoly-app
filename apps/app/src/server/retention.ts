import "server-only";
import { db } from "@/lib/db";

const YEAR = 365.25 * 86_400_000;

/**
 * RG-RGPD-02 et section 11 : conservation des données selon la politique de confidentialité.
 * Commandes de plus de 7 ans anonymisées (durée légale des pièces comptables en Belgique), journaux d'envoi des e-mails
 * anonymisés après 12 mois, journal d'audit (journal de sécurité) supprimé après 12 mois.
 */
export async function applyRetention(now = new Date()) {
  const sevenYears = new Date(now.getTime() - 7 * YEAR);
  const oneYear = new Date(now.getTime() - YEAR);
  const old = await db.order.findMany({
    where: { createdAt: { lt: sevenYears }, NOT: { buyerEmail: { startsWith: "anonyme+" } } },
    select: { id: true },
    take: 5000,
  });
  const ids = old.map((o) => o.id);
  if (ids.length) {
    await db.$transaction([
      db.order.updateMany({ where: { id: { in: ids } }, data: { buyerFirstName: "Anonyme", buyerLastName: "", buyerPhone: null, marketingOptIn: false } }),
      db.$executeRaw`UPDATE "Order" SET "buyerEmail" = 'anonyme+' || id || '@evoly.invalid' WHERE id = ANY(${ids})`,
      db.ticket.updateMany({ where: { orderId: { in: ids } }, data: { holderFirstName: null, holderLastName: null, holderEmail: null } }),
      db.resaleListing.updateMany({ where: { sellerOrderId: { in: ids } }, data: { sellerEmail: "anonyme@evoly.invalid" } }),
    ]);
  }
  const emails = await db.emailMessage.updateMany({
    where: { queuedAt: { lt: oneYear }, NOT: { toEmail: "anonyme@evoly.invalid" } },
    data: { toEmail: "anonyme@evoly.invalid", retryPayload: undefined },
  });
  const audit = await db.auditLog.deleteMany({ where: { createdAt: { lt: oneYear } } });
  return { orders: ids.length, emails: emails.count, audit: audit.count };
}
