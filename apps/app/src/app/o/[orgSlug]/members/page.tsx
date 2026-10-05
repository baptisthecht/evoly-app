import { can, canOwnerOnly, hasFeature, PERMISSIONS, type Permission } from "@evoly/core";
import { formatDate, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { requireOrgContext } from "@/server/context";
import { teamOverview } from "@/server/team";
import { InvitationActions, InviteForm, LeaveOrganization, MemberRole, RemoveMember, RoleEditor, TransferOwnership } from "./TeamClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("members") };
}

/** Section 9.3 : onglets Membres et Rôles. */
export default async function MembersPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { orgSlug } = await params;
  const { tab } = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  const manageMembers = can(ctx.membership, "MEMBERS_MANAGE") && !ctx.readOnly;
  const manageRoles = can(ctx.membership, "ROLES_MANAGE") && !ctx.readOnly;
  if (!manageMembers && !manageRoles && !can(ctx.membership, "ORG_SETTINGS_EDIT")) notFound();
  const { members, invitations, roles } = await teamOverview(ctx);
  const t = await getTranslations("team");
  const tr = await getTranslations("roles");
  const tp = await getTranslations("permissions");
  const locale = (await getLocale()) as Locale;
  const team = hasFeature(ctx.features, "TEAM_MEMBERS");
  const customRoles = hasFeature(ctx.features, "CUSTOM_ROLES");
  const owner = canOwnerOnly(ctx.membership, "OWNERSHIP_TRANSFER");
  const label = (r: { name: string; systemKey: string | null }) => (r.systemKey ? tr(`${r.systemKey}.name`) : r.name);
  const assignable = roles.filter((r) => r.assignable).map((r) => ({ id: r.id, label: label(r) }));
  const allowed = PERMISSIONS.filter((p) => can(ctx.membership, p));
  const active = tab === "roles" ? "roles" : "members";
  return (
    <div className="grid max-w-5xl gap-6">
      <h1 className="page-title">{t("title")}</h1>
      <nav className="flex w-fit gap-1 rounded-full bg-surface-sunken p-1" aria-label={t("tabs")}>
        {(["members", "roles"] as const).map((k) => (
          <Link
            key={k}
            href={`/o/${orgSlug}/members${k === "roles" ? "?tab=roles" : ""}`}
            aria-current={active === k ? "page" : undefined}
            className={cn(
              "flex h-10 items-center rounded-full px-4 text-sm font-semibold",
              active === k ? "bg-surface-inverse text-ink-inverse" : "text-ink-muted",
            )}
          >
            {t(`tab_${k}`)}
          </Link>
        ))}
      </nav>

      {!team ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-accent px-4 py-3">
          <p className="text-sm">{t("upsell")}</p>
          <Link href={`/o/${orgSlug}/billing`} className={buttonClass("dark", "sm")}>
            {t("upgrade")}
          </Link>
        </div>
      ) : null}

      {active === "members" ? (
        <>
          {manageMembers && team ? (
            <Card className="grid gap-3">
              <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("inviteTitle")}</h2>
              <InviteForm orgSlug={orgSlug} roles={assignable} />
            </Card>
          ) : null}
          <Card className="grid gap-2">
            <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("membersTitle", { count: members.length })}</h2>
            <ul className="grid gap-2">
              {members.map((m) => {
                const isSelf = m.userId === ctx.user.id;
                const isOwnerRow = m.role.systemKey === "OWNER";
                const suspended = !team && !isOwnerRow;
                return (
                  <li key={m.id} className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{m.user.name}</span>
                        {isSelf ? <Badge>{t("you")}</Badge> : null}
                        {suspended ? <Badge tone="warning">{t("suspended")}</Badge> : null}
                      </p>
                      <p className="truncate text-sm text-ink-muted">
                        {m.user.email} · {t("joined", { date: formatDate(m.joinedAt, ctx.organization.timezone, locale) })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {manageMembers && !isOwnerRow && !isSelf && roles.find((r) => r.id === m.role.id)?.assignable ? (
                        <>
                          <MemberRole orgSlug={orgSlug} memberId={m.id} roleId={m.role.id} roles={assignable} />
                          <RemoveMember orgSlug={orgSlug} memberId={m.id} name={m.user.name} />
                        </>
                      ) : (
                        <Badge tone={isOwnerRow ? "dark" : "neutral"}>{label(m.role)}</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          {invitations.length > 0 ? (
            <Card className="grid gap-2">
              <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("pendingTitle")}</h2>
              <ul className="grid gap-2">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
                    <span>
                      <span className="font-semibold">{i.email}</span> · {label(i.role)} ·{" "}
                      {t("expires", { date: formatDate(i.expiresAt, ctx.organization.timezone, locale) })}
                    </span>
                    {manageMembers ? <InvitationActions orgSlug={orgSlug} invitationId={i.id} /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card className="grid gap-3">
            <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{owner ? t("transferTitle") : t("leaveTitle")}</h2>
            {owner ? (
              <>
                <p className="-mt-1 text-sm text-ink-muted">{t("transferIntro")}</p>
                <TransferOwnership
                  orgSlug={orgSlug}
                  members={members.filter((m) => m.userId !== ctx.user.id).map((m) => ({ id: m.id, label: `${m.user.name} (${m.user.email})` }))}
                />
              </>
            ) : (
              <LeaveOrganization orgSlug={orgSlug} />
            )}
          </Card>
        </>
      ) : (
        <>
          <section className="grid gap-3" aria-labelledby="system-roles">
            <h2 id="system-roles" className="font-display text-lg tracking-[var(--tracking-title)]">
              {t("systemRoles")}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {roles
                .filter((r) => r.systemKey)
                .map((r) => (
                  <Card key={r.id} className="grid gap-1">
                    <p className="font-semibold">{label(r)}</p>
                    <p className="text-sm text-ink-muted">{tr(`${r.systemKey}.description`)}</p>
                    <p className="text-xs text-ink-muted">{t("permissionsCount", { count: (r.permissions as Permission[]).length })}</p>
                  </Card>
                ))}
            </div>
          </section>
          <section className="grid gap-3" aria-labelledby="custom-roles">
            <h2 id="custom-roles" className="font-display text-lg tracking-[var(--tracking-title)]">
              {t("customRoles")}
            </h2>
            {!customRoles ? <p className="text-sm text-ink-muted">{t("customRolesUpsell")}</p> : null}
            {roles
              .filter((r) => !r.systemKey)
              .map((r) => (
                <Card key={r.id} className="grid gap-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <Badge>{t("membersUsing", { count: r._count.members })}</Badge>
                  </p>
                  {r.description ? <p className="text-sm text-ink-muted">{r.description}</p> : null}
                  <p className="text-xs text-ink-muted">{(r.permissions as Permission[]).map((p) => tp(p)).join(" · ")}</p>
                  {manageRoles && customRoles ? (
                    <RoleEditor
                      orgSlug={orgSlug}
                      role={{ id: r.id, name: r.name, description: r.description ?? "", permissions: r.permissions as Permission[] }}
                      allowed={allowed}
                    />
                  ) : null}
                </Card>
              ))}
            {manageRoles && customRoles ? <RoleEditor orgSlug={orgSlug} role={null} allowed={allowed} /> : null}
          </section>
        </>
      )}
    </div>
  );
}
