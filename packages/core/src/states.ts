import { CoreError } from "./errors";

type Machine<S extends string> = Readonly<Record<S, readonly S[]>>;

/** Cycles de vie (CDC section 8.4). */
export const EVENT_TRANSITIONS: Machine<"DRAFT" | "PUBLISHED" | "SALES_PAUSED" | "CANCELLED" | "ENDED" | "ARCHIVED"> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["SALES_PAUSED", "CANCELLED", "ENDED"],
  SALES_PAUSED: ["PUBLISHED", "CANCELLED", "ENDED"],
  CANCELLED: ["ARCHIVED"],
  ENDED: ["ARCHIVED"],
  ARCHIVED: [],
};

export const ORDER_TRANSITIONS: Machine<"PENDING" | "PAID" | "EXPIRED" | "FAILED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED"> = {
  PENDING: ["PAID", "EXPIRED", "FAILED"],
  PAID: ["PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  EXPIRED: ["PAID"], // paiement tardif honoré si les places sont encore disponibles (RG-BUY-02)
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export const TICKET_TRANSITIONS: Machine<"VALID" | "CHECKED_IN" | "VOID" | "REFUNDED"> = {
  VALID: ["CHECKED_IN", "VOID", "REFUNDED"],
  CHECKED_IN: ["VALID", "REFUNDED"], // annulation d'entrée (P1) ; remboursement par l'organisateur seulement (RG-REF-04)
  VOID: [],
  REFUNDED: [],
};

export const RESALE_TRANSITIONS: Machine<"ACTIVE" | "RESERVED" | "SOLD" | "CANCELLED" | "EXPIRED" | "FAILED"> = {
  ACTIVE: ["RESERVED", "CANCELLED", "EXPIRED"],
  RESERVED: ["SOLD", "ACTIVE", "FAILED"],
  SOLD: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: ["SOLD"], // résolu à la main par le support (RG-RSL-06)
};

export const REFUND_TRANSITIONS: Machine<"REQUESTED" | "APPROVED" | "REJECTED" | "PROCESSING" | "SUCCEEDED" | "FAILED"> = {
  REQUESTED: ["APPROVED", "REJECTED", "PROCESSING"],
  APPROVED: ["PROCESSING"],
  REJECTED: [],
  PROCESSING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  FAILED: ["PROCESSING"],
};

export const DOMAIN_TRANSITIONS: Machine<"PENDING_DNS" | "ACTIVE" | "ERROR" | "DISABLED"> = {
  PENDING_DNS: ["ACTIVE", "ERROR", "DISABLED"],
  ACTIVE: ["ERROR", "DISABLED"],
  ERROR: ["ACTIVE", "DISABLED", "PENDING_DNS"],
  DISABLED: ["ACTIVE", "PENDING_DNS"],
};

export function canTransition<S extends string>(machine: Machine<S>, from: S, to: S): boolean {
  return machine[from].includes(to);
}

export function assertTransition<S extends string>(machine: Machine<S>, from: S, to: S, entity = "état"): void {
  if (!canTransition(machine, from, to)) throw new CoreError("INVALID_TRANSITION", `${entity} : passage de ${from} à ${to} interdit`);
}
