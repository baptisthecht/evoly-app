import { PERMISSIONS, type Permission } from "./permissions";

/**
 * Anti-escalade : un membre ne peut attribuer (ou créer) un rôle que si ce rôle n'accorde aucune permission
 * qu'il n'a pas lui-même. Le rôle de propriétaire ne s'attribue jamais : il se transfère (RG-ORG-01).
 */
export function canAssignRole(actor: readonly Permission[], role: { systemKey?: string | null; permissions: readonly Permission[] }): boolean {
  if (role.systemKey === "OWNER") return false;
  const own = new Set(actor);
  return role.permissions.every((p) => own.has(p));
}

/** Permissions d'un rôle personnalisé : connues, sans doublon, au moins une. */
export function cleanPermissions(input: readonly string[]): Permission[] | null {
  const known = new Set<string>(PERMISSIONS);
  const out = [...new Set(input)].filter((p): p is Permission => known.has(p));
  return out.length > 0 && out.length === new Set(input).size ? out : null;
}

/** RG-ORG-02 : invitation valable 48 heures, à usage unique. */
export const INVITATION_TTL_MS = 48 * 3_600_000;
export function invitationUsable(inv: { status: string; expiresAt: Date }, now: Date): "OK" | "EXPIRED" | "USED" | "REVOKED" {
  if (inv.status === "ACCEPTED") return "USED";
  if (inv.status === "REVOKED") return "REVOKED";
  if (inv.status === "EXPIRED" || inv.expiresAt <= now) return "EXPIRED";
  return "OK";
}

/** Groupes de permissions pour l'éditeur de rôles (onglet Rôles). */
export const PERMISSION_GROUPS: ReadonlyArray<{ key: string; permissions: readonly Permission[] }> = [
  {
    key: "organization",
    permissions: ["ORG_SETTINGS_EDIT", "BRAND_EDIT", "DOMAINS_MANAGE", "BILLING_MANAGE", "PAYMENTS_MANAGE", "MEMBERS_MANAGE", "ROLES_MANAGE"],
  },
  { key: "events", permissions: ["EVENTS_CREATE", "EVENTS_EDIT", "EVENTS_PUBLISH", "EVENTS_CANCEL", "EVENTS_DELETE", "TICKETS_MANAGE", "PROMO_MANAGE"] },
  { key: "sales", permissions: ["ORDERS_VIEW", "ORDERS_MANAGE", "REFUNDS_MANAGE", "RESALE_MANAGE", "FINANCE_VIEW", "STATS_VIEW"] },
  { key: "entries", permissions: ["CHECKIN_SCAN", "CHECKIN_MANAGE"] },
  { key: "marketing", permissions: ["MARKETING_MANAGE", "CONTACTS_EXPORT"] },
];
