import {
  can,
  canOwnerOnly,
  hasFeature,
  PERMISSION_GROUPS,
  PERMISSIONS,
  type Permission,
} from "@evoly/core";
import { formatShortDate, formatTime, type Locale } from "@evoly/i18n";
import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { SectionTitle, SettingsRow } from "@/components/ui/Controls";
import { BandText, HighlightBand } from "@/components/ui/HighlightBand";
import { requireOrgContext } from "@/server/context";
import { MembersTable } from "./MembersTable";
import { teamOverview } from "@/server/team";
import {
  InvitationActions,
  LeaveOrganization,
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
  const td = "border-b border-line p-2.5 align-middle tabular-nums";
  // l'ordre des domaines de la maquette : événements, ventes, marketing, entrées, organisation
  const groups = ["events", "sales", "marketing", "entries", "organization"]
    .map((k) => PERMISSION_GROUPS.find((g) => g.key === k)!)
    .filter(Boolean);
  const invitedFor = (roleId: string) =>
    invitations.filter((i) => i.role.id === roleId).length;
  return (
    <div className="grid gap-6">
      {!team ? (
        <HighlightBand className="md:grid-cols-[minmax(0,1fr)_auto]">
          <BandText>{t("upsell")}</BandText>
          <Link
            href={`/o/${orgSlug}/billing`}
            className={buttonClass("secondary")}
          >
            {t("upgrade")}
          </Link>
        </HighlightBand>
      ) : null}

      {active === "members" ? (
        <>
          {/* refonte A3 (maquette Équipe, membres) : « 4 membres », le tableau ; « Inviter un membre » est dans la bande */}
          <section aria-labelledby="members-title">
            <SectionTitle
              id="members-title"
              title={t("membersTitle", { count: members.length })}
            />
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
                  // comme la maquette : « 12 sept. 2026 »
                  joined: new Intl.DateTimeFormat(locale, {
                    timeZone: ctx.organization.timezone,
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(m.joinedAt),
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
          </section>
          {invitations.length > 0 ? (
            <section aria-labelledby="pending-title">
              <SectionTitle id="pending-title" title={t("pendingTitle")} />
              <table className="w-full border-collapse">
                <tbody>
                  {invitations.map((i) => (
                    <tr key={i.id}>
                      <td className={td}>
                        <span className="flex min-w-0 items-center gap-[11px]">
                          <span
                            aria-hidden="true"
                            className="size-[30px] shrink-0 rounded-full border-[1.5px] border-dashed border-dash"
                          />
                          <span className="min-w-0">
                            <b className="block font-medium">{i.email}</b>
                            {i.invitedBy ? (
                              <small className="text-[12.5px] text-ink-muted">
                                {t("invitedBy", { name: i.invitedBy.name })}
                              </small>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className={td}>{label(i.role)}</td>
                      <td className={td}>
                        <small className="text-[12.5px] text-ink-muted">
                          {t("expiresAt", {
                            date: formatShortDate(
                              i.expiresAt,
                              ctx.organization.timezone,
                              locale,
                            ),
                            time: formatTime(
                              i.expiresAt,
                              ctx.organization.timezone,
                              locale,
                            ),
                          })}
                        </small>
                      </td>
                      <td className={cn(td, "text-right")}>
                        {manageMembers ? (
                          <InvitationActions
                            orgSlug={orgSlug}
                            invitationId={i.id}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          <SettingsRow
            title={owner ? t("transferTitle") : t("leaveTitle")}
            description={owner ? t("transferDesc") : undefined}
            className="border-b-0 pt-1"
          >
            {owner ? (
              <>
                <p className="text-[13.5px] text-ink-body">
                  {t("transferText")}
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
          </SettingsRow>
        </>
      ) : (
        <>
          {/* refonte A3 (maquette Équipe, rôles) : la matrice des droits groupée par domaine ; les rôles créés s'ouvrent
              dans une fenêtre en cliquant sur leur nom, « Créer un rôle » est dans la bande du titre */}
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              aria-label={t("matrixTitle")}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-[300px] border-b border-line px-2.5 py-[7px] text-left text-[12.5px] leading-[normal] font-medium text-ink-muted"
                  >
                    <span className="sr-only">{t("matrixPermission")}</span>
                  </th>
                  {roles.map((r) => (
                    <th
                      key={r.id}
                      scope="col"
                      className="border-b border-line px-2.5 py-[7px] text-center text-[12.5px] leading-[normal] font-medium text-ink-muted"
                    >
                      <span className="font-semibold text-ink-strong">
                        {!r.systemKey && manageRoles && customRoles ? (
                          <RoleEditor
                            orgSlug={orgSlug}
                            role={{
                              id: r.id,
                              name: r.name,
                              description: r.description ?? "",
                              permissions: r.permissions as Permission[],
                            }}
                            allowed={allowed}
                            trigger={label(r)}
                          />
                        ) : (
                          label(r)
                        )}
                        <small className="block text-[12px] font-normal text-ink-muted">
                          {t("roleUsage", {
                            members: r._count.members,
                            invited: invitedFor(r.id),
                          })}
                        </small>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr>
                      <td
                        colSpan={roles.length + 1}
                        className="border-b border-line bg-surface-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-muted"
                      >
                        {t(`group_${g.key}`)}
                      </td>
                    </tr>
                    {g.permissions.map((p) => (
                      <tr key={p}>
                        <th
                          scope="row"
                          className={cn(td, "text-left font-normal")}
                        >
                          {tp(p)}
                        </th>
                        {roles.map((r) => {
                          const on = (r.permissions as Permission[]).includes(
                            p,
                          );
                          return (
                            <td key={r.id} className={cn(td, "text-center")}>
                              {on ? (
                                <svg
                                  role="img"
                                  aria-label={t("matrixYes")}
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2.4}
                                  className="inline-block size-[18px] align-middle text-ink-strong"
                                >
                                  <path d="m5 12 5 5 9-10" />
                                </svg>
                              ) : (
                                <span
                                  role="img"
                                  aria-label={t("matrixNo")}
                                  className="inline-block h-[1.5px] w-2.5 bg-dash align-middle"
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!customRoles ? (
            <p className="text-[12.5px] text-ink-muted">
              {t("customRolesUpsell")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
