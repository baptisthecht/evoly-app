"use server";

import { safeNext } from "@/lib/safeRedirect";

import { isLocale } from "@evoly/i18n";
import { APIError } from "better-auth/api";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/i18n/request";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formToObject, zodFields, type ActionState } from "@/server/guard";
import { hit, isLimited, reset } from "@/server/rateLimit";
import { clientIp } from "@/server/requestInfo";
import { createStarterOrganizationAndEvent } from "@/server/quickStart";
import { queueTrackedEvent, readAcquisition } from "@/server/trackingServer";
import { writeStartNotice } from "@/server/startNotice";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "validation.email" }));
const password = z.string().min(10, { message: "validation.passwordLength" }).max(128, { message: "validation.passwordLength" });

const registerSchema = z.object({
  name: z.string().trim().min(2, { message: "validation.nameLength" }).max(80, { message: "validation.nameLength" }),
  email,
  password,
});
const loginSchema = z.object({ email, password: z.string().min(1, { message: "validation.required" }) });
const emailOnly = z.object({ email });
const resetSchema = z.object({ token: z.string().min(1), password });

const LOGIN_WINDOW = 15 * 60;

function apiCode(e: unknown): { status: number; code: string } | null {
  if (e instanceof APIError) return { status: Number(e.statusCode ?? 500), code: String((e.body as { code?: string } | undefined)?.code ?? e.status) };
  return null;
}

/** US-AUTH-01 : création de compte, puis vérification de l'adresse. */
export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  const ip = await clientIp();
  if ((await hit(`register:ip:${ip}`, 60 * 60)) > 10) return { ok: false, error: "TOO_MANY_ATTEMPTS" };
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
  try {
    await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        locale: isLocale(locale) ? locale : "fr",
        callbackURL: "/onboarding",
      },
      headers: await headers(),
    });
  } catch (e) {
    const c = apiCode(e);
    if (c?.code === "USER_ALREADY_EXISTS" || c?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return { ok: false, error: "EMAIL_TAKEN" };
    if (c?.code === "PASSWORD_TOO_SHORT" || c?.code === "PASSWORD_TOO_LONG")
      return { ok: false, error: "INVALID_INPUT", fields: { password: "validation.passwordLength" } };
    throw e;
  }
  await queueTrackedEvent("sign_up"); // compte créé : conversion envoyée par la page suivante, avec consentement
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

/** US-AUTH-05 et RG-AUTH-05 : 5 échecs en 15 minutes bloquent l'adresse et l'IP. */
export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  const ip = await clientIp();
  const keys = [`login:email:${parsed.data.email}`, `login:ip:${ip}`];
  if ((await isLimited(keys[0]!, LOGIN_WINDOW, 5)) || (await isLimited(keys[1]!, LOGIN_WINDOW, 20))) return { ok: false, error: "TOO_MANY_ATTEMPTS" };
  try {
    await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password, callbackURL: "/" }, headers: await headers() });
  } catch (e) {
    const c = apiCode(e);
    if (c?.code === "EMAIL_NOT_VERIFIED") redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}&resent=1`);
    if (c && c.status < 500) {
      await Promise.all(keys.map((k) => hit(k, LOGIN_WINDOW)));
      return { ok: false, error: "INVALID_CREDENTIALS" };
    }
    throw e;
  }
  await reset(keys[0]!);
  await db.user.update({ where: { email: parsed.data.email }, data: { lastLoginAt: new Date() } });
  // retour à la page demandée avant la connexion (chemin interne uniquement)
  redirect(safeNext(form.get("next")) ?? "/");
}

export async function resendVerificationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = emailOnly.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  if ((await hit(`verify:email:${parsed.data.email}`, 60 * 60)) <= 3) {
    try {
      await auth.api.sendVerificationEmail({ body: { email: parsed.data.email, callbackURL: "/onboarding" } });
    } catch {
      // réponse identique que l'adresse existe ou non
    }
  }
  return { ok: true, data: null };
}

/** US-AUTH-04 et RG-AUTH-06 : même réponse, que le compte existe ou non. */
export async function forgotPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = emailOnly.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  if ((await hit(`reset:email:${parsed.data.email}`, 60 * 60)) <= 3) {
    try {
      await auth.api.requestPasswordReset({ body: { email: parsed.data.email, redirectTo: `${env().NEXT_PUBLIC_APP_URL}/reset-password` } });
    } catch {
      // idem
    }
  }
  return { ok: true, data: null };
}

export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  try {
    await auth.api.resetPassword({ body: { newPassword: parsed.data.password, token: parsed.data.token } });
  } catch (e) {
    if (apiCode(e)) return { ok: false, error: "RESET_TOKEN_INVALID" };
    throw e;
  }
  redirect("/login?reset=1");
}

export async function logoutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function setLocaleAction(form: FormData): Promise<void> {
  const value = String(form.get("locale") ?? "");
  if (!isLocale(value)) return;
  (await cookies()).set(LOCALE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) await db.user.update({ where: { id: session.user.id }, data: { locale: value } });
}

/** US-AUTH-02 : connexion ou inscription avec Google ou Apple (compte vérifié d'office, lié au compte e-mail existant, RG-AUTH-04). */
export async function socialSignInAction(provider: "google" | "apple", next: string | null) {
  const res = await auth.api.signInSocial({ body: { provider, callbackURL: safeNext(next) ?? "/" }, headers: await headers() });
  if (res?.url) redirect(res.url);
  redirect("/login");
}

const quickStartSchema = z.object({
  title: z.string().trim().min(2, { message: "validation.required" }).max(120),
  startsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "validation.required" }),
  locationName: z.string().trim().min(1, { message: "validation.required" }).max(120),
  city: z.string().trim().min(1, { message: "validation.required" }).max(80),
  addressLine1: z.string().trim().max(160).optional(),
  postalCode: z.string().trim().max(16).optional(),
  country: z.union([z.literal(""), z.string().regex(/^[A-Z]{2}$/)]).optional(),
  // facultatifs : sans prix, billets gratuits ; sans nombre, places illimitées
  price: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^\d{1,6}([.,]\d{1,2})?$/, { message: "validation.number" }),
    ])
    .optional(),
  quantity: z.union([z.literal(""), z.coerce.number({ message: "validation.number" }).int().min(1).max(100_000)]).optional(),
  orgName: z.string().trim().min(2, { message: "validation.required" }).max(80),
  type: z.enum(["ASSOCIATION", "COMPANY", "INDIVIDUAL", "PUBLIC_BODY"]),
  email: registerSchema.shape.email,
  password: registerSchema.shape.password,
  terms: z.literal("on", { message: "validation.required" }),
});

/**
 * Création rapide pour les visiteurs des annonces (/start) : l'événement d'abord, le compte à la fin. Compte,
 * organisation (offre de lancement comprise) et événement en brouillon sont créés d'un coup ; le lien de vérification
 * mène ensuite au tableau de bord, où l'événement attend d'être publié.
 */
export async function quickStartAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = quickStartSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fields: zodFields(parsed.error) };
  const ip = await clientIp();
  if ((await hit(`register:ip:${ip}`, 60 * 60)) > 10) return { ok: false, error: "TOO_MANY_ATTEMPTS" };
  const d = parsed.data;
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
  let userId: string;
  try {
    const res = await auth.api.signUpEmail({
      body: { name: d.orgName, email: d.email, password: d.password, locale: isLocale(locale) ? locale : "fr", callbackURL: "/" },
      headers: await headers(),
    });
    userId = res.user.id;
  } catch (e) {
    const c = apiCode(e);
    if (c?.code === "USER_ALREADY_EXISTS" || c?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return { ok: false, error: "EMAIL_TAKEN" };
    if (c?.code === "PASSWORD_TOO_SHORT" || c?.code === "PASSWORD_TOO_LONG")
      return { ok: false, error: "INVALID_INPUT", fields: { password: "validation.passwordLength" } };
    throw e;
  }
  await queueTrackedEvent("sign_up");
  try {
    await createStarterOrganizationAndEvent(
      { id: userId, name: d.orgName, email: d.email },
      { name: d.orgName, type: d.type },
      {
        title: d.title,
        startsAtLocal: d.startsAtLocal,
        locationName: d.locationName,
        addressLine1: d.addressLine1 ?? "",
        postalCode: d.postalCode ?? "",
        city: d.city,
        country: d.country || "BE",
        price: d.price || "0",
        quantity: typeof d.quantity === "number" ? d.quantity : null,
      },
      await readAcquisition(),
    );
    await queueTrackedEvent("organization_created");
    // page de vérification de l'adresse : l'événement est enregistré et attend d'être publié
    await writeStartNotice({ email: d.email, title: d.title, startsAtLocal: d.startsAtLocal, place: [d.locationName, d.city].filter(Boolean).join(", ") });
  } catch (e) {
    // compte créé mais organisation ou événement refusés (date passée, par exemple) : l'accueil reprendra la création
    console.error("création rapide : organisation ou événement non créés", e);
  }
  redirect(`/verify-email?email=${encodeURIComponent(d.email)}`);
}
