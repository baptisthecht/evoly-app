import { sum, type Minor } from "./money";

export type RefundPolicy =
  "NON_REFUNDABLE" | "UNTIL_DEADLINE" | "ON_REQUEST" | "ALWAYS";

export interface RefundRequestInput {
  policy: RefundPolicy;
  deadlineAt?: Date | null;
  eventStatus: string;
  eventStartsAt: Date;
  lastMajorChangeAt?: Date | null;
  /** Fenêtre de remboursement après un changement de date ou de lieu (RG-EVT-05, décision 9). */
  changeWindowDays?: number;
  now: Date;
}

export interface RefundRequestCheck {
  /** L'acheteur peut envoyer une demande. */
  canRequest: boolean;
  /** La demande est hors délai : affichée comme telle à l'organisateur (RG-REF-01). */
  outOfDeadline: boolean;
  /** Motif proposé automatiquement. */
  reason: "BUYER_REQUEST" | "EVENT_CHANGED";
}

/** RG-REF-01 et RG-EVT-05 : un acheteur peut-il demander un remboursement ? */
export function checkRefundRequest(i: RefundRequestInput): RefundRequestCheck {
  const days = i.changeWindowDays ?? 14;
  const changed =
    i.lastMajorChangeAt != null &&
    i.now.getTime() < i.lastMajorChangeAt.getTime() + days * 86_400_000;
  if (changed && i.eventStatus !== "CANCELLED")
    return { canRequest: true, outOfDeadline: false, reason: "EVENT_CHANGED" };
  if (i.eventStatus === "CANCELLED")
    return { canRequest: false, outOfDeadline: false, reason: "BUYER_REQUEST" }; // remboursé automatiquement
  switch (i.policy) {
    case "NON_REFUNDABLE":
      return {
        canRequest: false,
        outOfDeadline: true,
        reason: "BUYER_REQUEST",
      };
    case "ALWAYS":
      return {
        canRequest: i.now.getTime() < i.eventStartsAt.getTime(),
        outOfDeadline: i.now.getTime() >= i.eventStartsAt.getTime(),
        reason: "BUYER_REQUEST",
      };
    case "ON_REQUEST":
      return {
        canRequest: true,
        outOfDeadline: i.now.getTime() >= i.eventStartsAt.getTime(),
        reason: "BUYER_REQUEST",
      };
    case "UNTIL_DEADLINE": {
      const deadline = i.deadlineAt ?? i.eventStartsAt;
      const late = i.now.getTime() >= deadline.getTime();
      return { canRequest: true, outOfDeadline: late, reason: "BUYER_REQUEST" };
    }
  }
}

/** RG-REF-02 : un remboursement porte sur des billets précis, au prix payé. */
export function refundAmount(
  tickets: ReadonlyArray<{ faceValueMinor: Minor; status: string }>,
): Minor {
  return sum(
    tickets
      .filter((t) => t.status === "VALID" || t.status === "CHECKED_IN")
      .map((t) => t.faceValueMinor),
  );
}

/**
 * Commission rendue à l'organisateur lors d'un remboursement : jamais (RG-FEE-40, décision validée),
 * y compris lors d'une annulation d'événement. Le remboursement Stripe se fait sans restituer les frais d'application.
 */
export const REFUND_APPLICATION_FEE = false;

/**
 * Remboursement à coût neutre (lot du 16 novembre 2026) : réglage par événement, valeur par défaut au niveau de
 * l'organisation, figé sur la commande à la réservation (la règle affichée avant l'achat est celle qui s'applique).
 * FULL : l'acheteur récupère le prix payé en entier, les frais restent à la charge de l'organisateur.
 * MINUS_FEES : l'acheteur récupère le prix payé moins les frais de paiement et la commission d'Evoly.
 */
export type RefundFeeMode = "FULL" | "MINUS_FEES";

/**
 * Le réglage ne vaut que pour un remboursement demandé par l'acheteur pour son propre motif (demande, politique de
 * l'événement). Annulation de l'événement, changement de date ou de lieu, remboursement ou annulation à l'initiative de
 * l'organisateur : toujours en entier, ce n'est pas le fait de l'acheteur.
 */
export function buyerBearsRefundFees(r: {
  initiator: string;
  reason: string;
}): boolean {
  return r.initiator === "BUYER" && r.reason === "BUYER_REQUEST";
}

/**
 * Frais retenus sur un remboursement en mode « moins les frais » : frais de paiement et commission d'Evoly de la
 * commande, au prorata du montant remboursé (remboursement partiel), sans dépasser ce qui reste à retenir sur la
 * commande ni le montant remboursé. Mode intégral ou commande gratuite : rien. Evoly garde sa commission (RG-FEE-40).
 */
export function refundFeesWithheld(i: {
  mode: RefundFeeMode;
  /** Montant remboursé au prix payé (billets, et options le cas échéant). */
  grossMinor: Minor;
  orderTotalMinor: Minor;
  applicationFeeMinor: Minor;
  /** Frais de paiement réels, ou estimés tant que Stripe ne les a pas transmis. */
  paymentFeeMinor: Minor;
  /** Frais déjà retenus par les remboursements précédents de la commande. */
  alreadyWithheldMinor?: Minor;
}): Minor {
  if (i.mode !== "MINUS_FEES" || i.grossMinor <= 0 || i.orderTotalMinor <= 0)
    return 0;
  const fees =
    Math.max(0, i.applicationFeeMinor) + Math.max(0, i.paymentFeeMinor);
  const share = Math.round(
    (fees * Math.min(i.grossMinor, i.orderTotalMinor)) / i.orderTotalMinor,
  );
  const left = Math.max(0, fees - (i.alreadyWithheldMinor ?? 0));
  return Math.min(share, left, i.grossMinor);
}

/** Règle de remboursement d'un événement, telle qu'affichée avant l'achat (page de l'événement, tunnel d'achat). */
export interface RefundRule {
  policy: RefundPolicy;
  /** Date limite (ISO), pour « jusqu'à une date limite ». */
  deadlineAt: string | null;
  timezone: string;
  feeMode: RefundFeeMode;
}

/** La règle d'un événement (politique, date limite) avec le mode de remboursement des frais, figé sur la commande. */
export function refundRuleOf(
  event: {
    refundPolicy: RefundPolicy;
    refundDeadlineAt: Date | null;
    timezone: string;
  },
  feeMode: RefundFeeMode,
): RefundRule {
  return {
    policy: event.refundPolicy,
    deadlineAt: event.refundDeadlineAt?.toISOString() ?? null,
    timezone: event.timezone,
    feeMode,
  };
}
