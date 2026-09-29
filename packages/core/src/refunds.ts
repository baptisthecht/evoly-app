import { sum, type Minor } from "./money";

export type RefundPolicy = "NON_REFUNDABLE" | "UNTIL_DEADLINE" | "ON_REQUEST" | "ALWAYS";

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
  const changed = i.lastMajorChangeAt != null && i.now.getTime() < i.lastMajorChangeAt.getTime() + days * 86_400_000;
  if (changed && i.eventStatus !== "CANCELLED") return { canRequest: true, outOfDeadline: false, reason: "EVENT_CHANGED" };
  if (i.eventStatus === "CANCELLED") return { canRequest: false, outOfDeadline: false, reason: "BUYER_REQUEST" }; // remboursé automatiquement
  switch (i.policy) {
    case "NON_REFUNDABLE":
      return { canRequest: false, outOfDeadline: true, reason: "BUYER_REQUEST" };
    case "ALWAYS":
      return { canRequest: i.now.getTime() < i.eventStartsAt.getTime(), outOfDeadline: i.now.getTime() >= i.eventStartsAt.getTime(), reason: "BUYER_REQUEST" };
    case "ON_REQUEST":
      return { canRequest: true, outOfDeadline: i.now.getTime() >= i.eventStartsAt.getTime(), reason: "BUYER_REQUEST" };
    case "UNTIL_DEADLINE": {
      const deadline = i.deadlineAt ?? i.eventStartsAt;
      const late = i.now.getTime() >= deadline.getTime();
      return { canRequest: true, outOfDeadline: late, reason: "BUYER_REQUEST" };
    }
  }
}

/** RG-REF-02 : un remboursement porte sur des billets précis, au prix payé. */
export function refundAmount(tickets: ReadonlyArray<{ faceValueMinor: Minor; status: string }>): Minor {
  return sum(tickets.filter((t) => t.status === "VALID" || t.status === "CHECKED_IN").map((t) => t.faceValueMinor));
}

/**
 * Commission rendue à l'organisateur lors d'un remboursement : jamais (RG-FEE-40, décision validée),
 * y compris lors d'une annulation d'événement. Le remboursement Stripe se fait sans restituer les frais d'application.
 */
export const REFUND_APPLICATION_FEE = false;
