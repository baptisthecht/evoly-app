import "server-only";
import { can, CoreError, hasFeature, type Permission, type PlanFeature } from "@evoly/core";
import type { z } from "zod";
import { findOrgContext, type OrgContext } from "./context";
import { db } from "@/lib/db";
import { twoFactorSatisfied } from "./twoFactor";
import { getSession } from "./session";

export type ActionError = "INVALID_INPUT" | "UNAUTHENTICATED" | "NOT_FOUND" | "FORBIDDEN" | "PRO_REQUIRED" | "READ_ONLY" | (string & {});

export type ActionState<T = unknown> = { ok: true; data: T } | { ok: false; error: ActionError; fields?: Record<string, string> } | null;

/** Transforme un FormData en objet simple pour Zod. */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Enveloppe unique des actions d'organisation (RG-ARC-03) :
 * validation, authentification, appartenance, permission, offre, lecture seule, puis traitement.
 */
export async function runOrgAction<S extends z.ZodType, T>(
  orgSlug: string,
  input: unknown,
  opts: { schema: S; permission?: Permission; feature?: PlanFeature; write?: boolean },
  handler: (data: z.infer<S>, ctx: OrgContext) => Promise<T>,
): Promise<ActionState<T>> {
  const parsed = opts.schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  const session = await getSession();
  if (!session || !session.user.emailVerified) return { ok: false, error: "UNAUTHENTICATED" };
  // une action ne contourne pas la double authentification (le mot de passe seul ne suffit pas)
  const twoFa = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, twoFactorEnabled: true } });
  if (twoFa && !(await twoFactorSatisfied(twoFa, session.session.id))) return { ok: false, error: "TWO_FACTOR_REQUIRED" };
  const found = await findOrgContext(session.user.id, orgSlug);
  if (!found) return { ok: false, error: "NOT_FOUND" };
  const ctx: OrgContext = { user: { id: session.user.id, name: session.user.name, email: session.user.email }, ...found };
  if (opts.permission && !can(ctx.membership, opts.permission)) return { ok: false, error: "FORBIDDEN" };
  if (opts.feature && !hasFeature(ctx.features, opts.feature)) return { ok: false, error: "PRO_REQUIRED" };
  if (opts.write !== false && ctx.readOnly) return { ok: false, error: "READ_ONLY" };
  try {
    const data = await handler(parsed.data, ctx);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof CoreError) return { ok: false, error: err.code };
    throw err;
  }
}
