"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";
import { changeMemberRole, deleteCustomRole, inviteMember, leaveOrganization, removeMember, resendInvitation, revokeInvitation, saveCustomRole, transferOwnership } from "@/server/team";

const path = (orgSlug: string) => `/o/${orgSlug}/members`;

export async function inviteAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const schema = z.object({ email: z.email({ message: "validation.email" }).max(200), roleId: z.string().min(1).max(40) });
  const r = await runOrgAction(orgSlug, formToObject(form), { schema, permission: "MEMBERS_MANAGE", feature: "TEAM_MEMBERS" }, async (d, ctx) => {
    await inviteMember(ctx, d.email, d.roleId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

export async function invitationCommandAction(orgSlug: string, invitationId: string, command: "resend" | "revoke", _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "MEMBERS_MANAGE" }, async (_d, ctx) => {
    if (command === "resend") await resendInvitation(ctx, invitationId);
    else await revokeInvitation(ctx, invitationId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

export async function memberRoleAction(orgSlug: string, memberId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema: z.object({ roleId: z.string().min(1).max(40) }), permission: "MEMBERS_MANAGE" }, async (d, ctx) => {
    await changeMemberRole(ctx, memberId, d.roleId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

export async function removeMemberAction(orgSlug: string, memberId: string, _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "MEMBERS_MANAGE" }, async (_d, ctx) => {
    await removeMember(ctx, memberId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

export async function leaveAction(orgSlug: string, _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), write: false }, async (_d, ctx) => {
    await leaveOrganization(ctx);
    return null;
  });
  if (r?.ok) redirect("/");
  return r;
}

export async function transferAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema: z.object({ memberId: z.string().min(1).max(40) }), permission: "MEMBERS_MANAGE" }, async (d, ctx) => {
    await transferOwnership(ctx, d.memberId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

export async function saveRoleAction(orgSlug: string, roleId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const data = { ...formToObject(form), permissions: form.getAll("permissions").map(String) };
  const schema = z.object({ name: z.string().trim().min(2, { message: "validation.textLength" }).max(40), description: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(200).nullable()), permissions: z.array(z.string().max(40)).max(40) });
  const r = await runOrgAction(orgSlug, data, { schema, permission: "ROLES_MANAGE", feature: "CUSTOM_ROLES" }, async (d, ctx) => {
    await saveCustomRole(ctx, { id: roleId, ...d });
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

export async function deleteRoleAction(orgSlug: string, roleId: string, _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "ROLES_MANAGE" }, async (_d, ctx) => {
    await deleteCustomRole(ctx, roleId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}
