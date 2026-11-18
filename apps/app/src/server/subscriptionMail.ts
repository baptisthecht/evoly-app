import "server-only";
import { type Locale, toLocale } from "@evoly/i18n";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeError } from "@/lib/redact";
import { sendEmail } from "./email/send";
import {
  subscriptionEmail,
  type SubscriptionEmailKind,
  type SubVars,
} from "./email/templates";

/** Page Abonnement de l'organisation, dans l'application. */
export const billingUrl = (slug: string) =>
  `${env().NEXT_PUBLIC_APP_URL}/o/${slug}/billing`;

/** Propriétaire de l'organisation : il reçoit les e-mails d'abonnement. */
export async function subscriptionOwner(organizationId: string) {
  const m = await db.organizationMember.findFirst({
    where: { organizationId, role: { systemKey: "OWNER" } },
    include: { user: { select: { email: true, name: true } } },
  });
  return m?.user ?? null;
}

/**
 * E-mail d'abonnement au propriétaire, dans la langue de l'organisation (dates et montants mis en forme pour elle). Un
 * échec d'envoi n'interrompt jamais un paiement ni une tâche planifiée.
 */
export async function notifyOwner(
  organizationId: string,
  kind: SubscriptionEmailKind,
  extra: {
    vars?: (l: { locale: Locale; timezone: string }) => SubVars;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  } = {},
) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, slug: true, locale: true, timezone: true },
  });
  const who = await subscriptionOwner(organizationId);
  if (!who) return;
  const locale = toLocale(org.locale);
  const mail = subscriptionEmail({
    kind,
    locale,
    organizationName: org.name,
    firstName: who.name.split(" ")[0] ?? who.name,
    url: billingUrl(org.slug),
    vars: extra.vars?.({ locale, timezone: org.timezone }),
  });
  await sendEmail({
    ...mail,
    to: who.email,
    template: `subscription.${kind.toLowerCase()}`,
    category: "SERVICE",
    organizationId,
    ...(extra.attachments ? { attachments: extra.attachments } : {}),
  }).catch((err) =>
    console.error("e-mail d'abonnement", organizationId, safeError(err)),
  );
}
