import {
  can,
  canOwnerOnly,
  hasFeature,
  PERMISSIONS,
  type Permission,
} from "@evoly/core";
import { formatDate, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { requireOrgContext } from "@/server/context";
import { InviteDialog, MembersTable } from "./MembersTable";
import { teamOverview } from "@/server/team";
import {
  InvitationActions,
  InviteForm,
  LeaveOrganization,
  MemberRole,
  RemoveMember,
  RoleEditor,
  TransferOwnership,
} from "./TeamClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("members") };
}

/** Section 9.3 : onglets Membres et Rôles. */
export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgSlug } = await params;
  const { tab } = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  const manageMembers = can(ctx.membership, "MEMBERS_MANAGE") && !ctx.readOnly;
  const manageRoles = can(ctx.membership, "ROLES_MANAGE") && !ctx.readOnly;
  if (
    !manageMembers &&
    !manageRoles &&
    !can(ctx.membership, "ORG_SETTINGS_EDIT")
  )
    notFound();
  const { members, invitations, roles } = await teamOverview(ctx);
  const t = await getTranslations("team");
  const tr = await getTranslations("roles");
  const tp = await getTranslations("permissions");
  const locale = (await getLocale()) as Locale;
  const team = hasFeature(ctx.features, "TEAM_MEMBERS");
  const customRoles = hasFeature(ctx.features, "CUSTOM_ROLES");
  const owner = canOwnerOnly(ctx.membership, "OWNERSHIP_TRANSFER");
  const label = (r: { name: string; systemKey: string | null }) =>
    r.systemKey ? tr(`${r.systemKey}.name`) : r.name;
  const assignable = roles
    .filter((r) => r.assignable)
    .map((r) => ({ id: r.id, label: label(r) }));
  const allowed = PERMISSIONS.filter((p) => can(ctx.membership, p));
  const active = tab === "roles" ? "roles" : "members";
  return (
    <div className="grid gap-6">
      {!team ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-accent px-4 py-3">
          <p className="text-sm">{t("upsell")}</p>
          <Link
            href={`/o/${orgSlug}/billing`}
            className={buttonClass("dark", "sm")}
          >
            {t("upgrade")}
          </Link>
        </div>
      ) : null}

      {active === "members" ? (
        <>
          {manageMembers && team ? (
            <InviteDialog orgSlug={orgSlug} roles={assignable} />
          ) : null}
          <MembersTable
            orgSlug={orgSlug}
            roles={assignable}
            rows={members.map((m) => {
              const isSelf = m.userId === ctx.user.id;
              const isOwnerRow = m.role.systemKey === "OWNER";
              return {
                id: m.id,
                name: m.user.name,
                email: m.user.email,
                joined: formatDate(
                  m.joinedAt,
                  ctx.organization.timezone,
                  locale,
                ),
                joinedAt: m.joinedAt.getTime(),
                self: isSelf,
                owner: isOwnerRow,
                suspended: !team && !isOwnerRow,
                roleId: m.role.id,
                roleLabel: label(m.role),
                editable:
                  manageMembers &&
                  !isOwnerRow &&
                  !isSelf &&
                  !!roles.find((r) => r.id === m.role.id)?.assignable,
              };
            })}
          />
          {invitations.length > 0 ? (
            <Card className="grid gap-2">
              <h2 className="font-display text-lg tracking-[var(--tracking-title)]">
                {t("pendingTitle")}
              </h2>
              <ul className="grid gap-2">
                {invitations.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm"
                  >
                    <span>
                      <span className="font-semibold">{i.email}</span> ·{" "}
                      {label(i.role)} ·{" "}
                      {t("expires", {
                        date: formatDate(
                          i.expiresAt,
                          ctx.organization.timezone,
                          locale,
                        ),
                      })}
                    </span>
                    {manageMembers ? (
                      <InvitationActions
                        orgSlug={orgSlug}
                        invitationId={i.id}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card className="grid gap-3">
            <h2 className="font-display text-lg tracking-[var(--tracking-title)]">
              {owner ? t("transferTitle") : t("leaveTitle")}
            </h2>
            {owner ? (
              <>
                <p className="-mt-1 text-sm text-ink-muted">
                  {t("transferIntro")}
                </p>
                <TransferOwnership
                  orgSlug={orgSlug}
                  members={members
                    .filter((m) => m.userId !== ctx.user.id)
                    .map((m) => ({
                      id: m.id,
                      label: `${m.user.name} (${m.user.email})`,
                    }))}
                />
              </>
            ) : (
              <LeaveOrganization orgSlug={orgSlug} />
            )}
          </Card>
        </>
      ) : (
        <>
          {/* matrice des droits : les droits en lignes, les rôles en colonnes */}
          <section className="grid gap-3" aria-labelledby="roles-matrix">
            <h2
              id="roles-matrix"
              className="font-display text-lg tracking-[var(--tracking-title)]"
            >
              {t("matrixTitle")}
            </h2>
            <div className="max-h-[70dvh] overflow-auto rounded-[var(--r-panel)] bg-surface-raised ring-1 ring-line">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{t("matrixTitle")}</caption>
                <thead className="sticky top-0 z-[2] bg-surface-raised">
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-[3] bg-surface-raised px-4 py-3 text-left text-xs font-semibold text-ink-muted"
                    >
                      {t("matrixPermission")}
                    </th>
                    {roles.map((r) => (
                      <th
                        key={r.id}
                        scope="col"
                        className="px-3 py-3 text-center text-xs font-semibold whitespace-nowrap"
                      >
                        {label(r)}
                        <span className="block font-normal text-ink-muted tabular-nums">
                          {t("permissionsCount", {
                            count: (r.permissions as Permission[]).length,
                          })}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map((p) => (
                    <tr
                      key={p}
                      className="border-t border-line hover:bg-surface-sunken/60"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-[1] bg-surface-raised px-4 py-2.5 text-left font-normal"
                      >
                        {tp(p)}
                      </th>
                      {roles.map((r) => {
                        const on = (r.permissions as Permission[]).includes(p);
                        return (
                          <td key={r.id} className="px-3 py-2.5 text-center">
                            {on ? (
                              <span
                                className="inline-flex size-6 items-center justify-center rounded-full bg-success-soft text-success"
                                aria-label={t("matrixYes")}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  className="size-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m5 12 5 5 9-10" />
                                </svg>
                              </span>
                            ) : (
                              <span
                                className="text-ink-subtle"
                                aria-label={t("matrixNo")}
                              >
                                ·
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="grid gap-3" aria-labelledby="custom-roles">
            <h2
              id="custom-roles"
              className="font-display text-lg tracking-[var(--tracking-title)]"
            >
              {t("customRoles")}
            </h2>
            {!customRoles ? (
              <p className="text-sm text-ink-muted">{t("customRolesUpsell")}</p>
            ) : null}
            {roles
              .filter((r) => !r.systemKey)
              .map((r) => (
                <Card key={r.id} className="grid gap-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <Badge>
                      {t("membersUsing", { count: r._count.members })}
                    </Badge>
                  </p>
                  {r.description ? (
                    <p className="text-sm text-ink-muted">{r.description}</p>
                  ) : null}
                  <p className="text-xs text-ink-muted">
                    {(r.permissions as Permission[])
                      .map((p) => tp(p))
                      .join(" · ")}
                  </p>
                  {manageRoles && customRoles ? (
                    <RoleEditor
                      orgSlug={orgSlug}
                      role={{
                        id: r.id,
                        name: r.name,
                        description: r.description ?? "",
                        permissions: r.permissions as Permission[],
                      }}
                      allowed={allowed}
                    />
                  ) : null}
                </Card>
              ))}
            {manageRoles && customRoles ? (
              <RoleEditor orgSlug={orgSlug} role={null} allowed={allowed} />
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
