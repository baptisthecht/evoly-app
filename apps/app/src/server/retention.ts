import "server-only";
import { db } from "@/lib/db";

const DAY = 86_400_000;
const YEAR = 365.25 * 86_400_000;

/**
 * RG-RGPD-02 et section 11 : conservation des données selon la politique de confidentialité.
 * Commandes de plus de 7 ans anonymisées (durée légale des pièces comptables en Belgique), journaux d'envoi des e-mails
 * anonymisés après 12 mois, journal d'audit (journal de sécurité) supprimé après 12 mois, liste d'attente supprimée le lendemain
 * de l'événement (RG-ATT-05), ambassadeurs anonymisés 12 mois après l'événement (RG-AMB-07).
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
  // liste d'attente supprimée le lendemain de la fin de l'événement, ou de son début sans fin renseignée (RG-ATT-05)
  const yesterday = new Date(now.getTime() - DAY);
  const waitlist = await db.waitlistEntry.deleteMany({
    where: { event: { OR: [{ endsAt: { lt: yesterday } }, { endsAt: null, startsAt: { lt: yesterday } }] } },
  });
  // ambassadeurs anonymisés 12 mois après l'événement (RG-AMB-07) : nom générique, sans e-mail, lien privé invalidé ;
  // les ventes déjà attribuées restent, pour des statistiques justes
  const amb = await db.ambassador.findMany({
    where: { event: { OR: [{ endsAt: { lt: oneYear } }, { endsAt: null, startsAt: { lt: oneYear } }] }, NOT: { statsToken: { startsWith: "anonyme-" } } },
    select: { id: true },
    take: 5000,
  });
  const ambIds = amb.map((a) => a.id);
  if (ambIds.length)
    await db.$transaction([
      db.ambassador.updateMany({ where: { id: { in: ambIds } }, data: { name: "Ambassadeur", email: null, active: false } }),
      db.$executeRaw`UPDATE "Ambassador" SET "statsToken" = 'anonyme-' || id WHERE id = ANY(${ambIds})`,
    ]);
  return { orders: ids.length, emails: emails.count, audit: audit.count, waitlist: waitlist.count, ambassadors: ambIds.length };
}
