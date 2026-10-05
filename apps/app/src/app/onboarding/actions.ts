"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { LAUNCH_COUNTRIES } from "@/lib/countries";
import { formToObject, runOrgAction, zodFields, type ActionState } from "@/server/guard";
import { createOrganization } from "@/server/onboarding";
import { hit } from "@/server/rateLimit";
import { getSession } from "@/server/session";
import { stripeOnboardingUrl } from "@/server/stripeConnect";
import { subdomainAvailability, type SubdomainAvailability } from "@/server/subdomains";
import { CoreError } from "@evoly/core";

const orgSchema = z.object({
  name: z.string().trim().min(2, { message: "validation.orgNameLength" }).max(80, { message: "validation.orgNameLength" }),
  subdomain: z.string().trim().toLowerCase(),
  country: z.enum(LAUNCH_COUNTRIES.map((c) => c.code) as [string, ...string[]], { message: "validation.required" }),
  type: z.enum(["INDIVIDUAL", "ASSOCIATION", "COMPANY", "PUBLIC_BODY"], { message: "validation.required" }),
  terms: z.literal("on", { message: "validation.termsRequired" }),
});

/** Vérification en direct de l'adresse de la page (US-ONB-01). */
export async function checkSubdomainAction(value: string): Promise<SubdomainAvailability | { ok: false; reason: "RATE_LIMITED" }> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "RATE_LIMITED" };
  if ((await hit(`subdomain-check:${session.user.id}`, 60)) > 60) return { ok: false, reason: "RATE_LIMITED" };
  return subdomainAvailability(value);
}

export async function createOrganizationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session?.user.emailVerified) return { ok: false, error: "UNAUTHENTICATED" };
  const parsed = orgSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  let slug: string;
  try {
    const org = await createOrganization(session.user.id, {
      name: parsed.data.name,
      subdomain: parsed.data.subdomain,
      country: parsed.data.country,
      type: parsed.data.type,
    });
    slug = org.slug;
  } catch (e) {
    if (e instanceof CoreError) {
      if (e.code.startsWith("SUBDOMAIN_")) return { ok: false, error: "INVALID_INPUT", fields: { subdomain: `validation.${e.code}` } };
      return { ok: false, error: e.code };
    }
    throw e;
  }
  redirect(`/onboarding/payments?org=${slug}`);
}

/** Onboarding Stripe (étape 2), réservé aux membres qui gèrent l'encaissement. */
export async function connectStripeAction(orgSlug: string, _: ActionState): Promise<ActionState> {
  const result = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "PAYMENTS_MANAGE" }, (_data, ctx) => stripeOnboardingUrl(ctx));
  if (result?.ok) redirect(result.data);
  return result;
}
