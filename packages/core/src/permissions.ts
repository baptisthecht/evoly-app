export const PERMISSIONS = [
  "ORG_SETTINGS_EDIT",
  "BRAND_EDIT",
  "DOMAINS_MANAGE",
  "BILLING_MANAGE",
  "PAYMENTS_MANAGE",
  "FINANCE_VIEW",
  "MEMBERS_MANAGE",
  "ROLES_MANAGE",
  "EVENTS_CREATE",
  "EVENTS_EDIT",
  "EVENTS_PUBLISH",
  "EVENTS_CANCEL",
  "EVENTS_DELETE",
  "TICKETS_MANAGE",
  "PROMO_MANAGE",
  "ORDERS_VIEW",
  "ORDERS_MANAGE",
  "REFUNDS_MANAGE",
  "RESALE_MANAGE",
  "CHECKIN_SCAN",
  "CHECKIN_MANAGE",
  "STATS_VIEW",
  "MARKETING_MANAGE",
  "CONTACTS_EXPORT",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type SystemRole = "OWNER" | "ADMIN" | "MANAGER" | "BOX_OFFICE" | "SCANNER" | "VIEWER";

/** Rôles système (annexe B du CDC). */
export const SYSTEM_ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly Permission[]>> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  MANAGER: [
    "EVENTS_CREATE", "EVENTS_EDIT", "EVENTS_PUBLISH", "EVENTS_CANCEL", "TICKETS_MANAGE", "PROMO_MANAGE", "ORDERS_VIEW",
    "ORDERS_MANAGE", "REFUNDS_MANAGE", "RESALE_MANAGE", "CHECKIN_SCAN", "CHECKIN_MANAGE", "STATS_VIEW", "MARKETING_MANAGE",
  ],
  BOX_OFFICE: ["ORDERS_VIEW", "ORDERS_MANAGE", "REFUNDS_MANAGE", "RESALE_MANAGE", "CHECKIN_SCAN", "STATS_VIEW"],
  SCANNER: ["CHECKIN_SCAN"],
  VIEWER: ["STATS_VIEW", "ORDERS_VIEW"],
};

export interface MembershipInput {
  status: "ACTIVE" | "SUSPENDED";
  systemRole?: SystemRole | null;
  permissions: readonly Permission[];
}

/** Contrôle unique des droits (RG-ARC-03, RG-ORG-07). Un membre suspendu n'a aucun droit. */
export function can(member: MembershipInput | null | undefined, permission: Permission): boolean {
  if (!member || member.status !== "ACTIVE") return false;
  return member.permissions.includes(permission);
}

/** Actions réservées au propriétaire, en plus de ses permissions. */
export type OwnerOnlyAction = "ORGANIZATION_DELETE" | "OWNERSHIP_TRANSFER";

export function canOwnerOnly(member: MembershipInput | null | undefined, _action: OwnerOnlyAction): boolean {
  return !!member && member.status === "ACTIVE" && member.systemRole === "OWNER";
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
