"use server";

import { db } from "@evoly/db";
import { registerSchema, onboardingStep1Schema, onboardingStep2Schema } from "@evoly/core/auth";
import { RESERVED_SLUGS } from "@evoly/core/billing";
import bcrypt from "bcryptjs";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { VerifyEmailTemplate } from "@evoly/email";
import { ResetPasswordTemplate } from "@evoly/email";
import { render } from "@react-email/render";
import crypto from "crypto";

// ─────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────

export async function registerAction(formData: FormData) {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
  };
  // Optional invite token — if valid, skip email verification
  const inviteToken = formData.get("inviteToken") as string | null;

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Données invalides." };
  }

  const { email, password, name } = parsed.data;

  // Check if user already exists
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet email." };
  }

  // If an invite token is provided, validate it and mark email as verified immediately
  let inviteIsValid = false;
  if (inviteToken) {
    const invitation = await db.invitation.findUnique({ where: { token: inviteToken } });
    if (
      invitation &&
      invitation.status === "PENDING" &&
      invitation.expiresAt >= new Date() &&
      invitation.email.toLowerCase() === email.toLowerCase()
    ) {
      inviteIsValid = true;
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash,
      // Skip email verification if coming from a valid invitation
      emailVerified: inviteIsValid ? new Date() : null,
    },
  });

  if (inviteIsValid) {
    // No verification email needed — return userId so the client can sign in directly
    return { success: true, userId: user.id, emailVerified: true };
  }

  // Standard flow: send verification email
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });

  const verificationUrl = `${process.env.NEXTAUTH_URL}/verify-email?token=${token}`;

  const html = await render(
    VerifyEmailTemplate({ verificationUrl, userName: name ?? undefined })
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Vérifiez votre adresse email — Evoly",
    html,
  });

  return { success: true, userId: user.id };
}

// ─────────────────────────────────────────
// VERIFY EMAIL
// ─────────────────────────────────────────

export async function verifyEmailAction(token: string) {
  const record = await db.verificationToken.findUnique({
    where: { token },
  });

  if (!record) {
    return { error: "Lien de vérification invalide." };
  }

  if (record.expires < new Date()) {
    await db.verificationToken.delete({ where: { token } });
    return { error: "Ce lien a expiré. Veuillez en demander un nouveau." };
  }

  // Mark email as verified
  await db.user.update({
    where: { email: record.identifier },
    data: { emailVerified: new Date() },
  });

  await db.verificationToken.delete({ where: { token } });

  return { success: true };
}

// ─────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────

export async function forgotPasswordAction(formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) return { error: "Email requis." };

  const user = await db.user.findUnique({ where: { email } });

  // Always return success to avoid email enumeration
  if (!user || !user.passwordHash) {
    return { success: true };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await db.verificationToken.create({
    data: {
      identifier: `reset:${email}`,
      token,
      expires,
    },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
  const html = await render(
    ResetPasswordTemplate({ resetUrl, userName: user.name ?? undefined })
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Réinitialiser votre mot de passe — Evoly",
    html,
  });

  return { success: true };
}

// ─────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────

export async function resetPasswordAction(formData: FormData) {
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;

  if (!token || !password) return { error: "Données manquantes." };
  if (password.length < 8) return { error: "Mot de passe trop court (min 8 caractères)." };

  const record = await db.verificationToken.findUnique({ where: { token } });

  if (!record || !record.identifier.startsWith("reset:")) {
    return { error: "Lien invalide ou expiré." };
  }

  if (record.expires < new Date()) {
    await db.verificationToken.delete({ where: { token } });
    return { error: "Ce lien a expiré. Veuillez en demander un nouveau." };
  }

  const email = record.identifier.replace("reset:", "");
  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.update({
    where: { email },
    data: { passwordHash },
  });

  await db.verificationToken.delete({ where: { token } });

  return { success: true };
}

// ─────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────

export async function checkSlugAvailability(slug: string) {
  if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return { available: false, reason: "Ce slug est réservé." };
  }

  const existing = await db.organization.findUnique({
    where: { slug: slug.toLowerCase() },
  });

  return { available: !existing };
}

export async function onboardingStep1Action(
  userId: string,
  formData: FormData
) {
  const raw = {
    organizationName: formData.get("organizationName"),
    slug: formData.get("slug"),
  };

  const parsed = onboardingStep1Schema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Données invalides.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { organizationName, slug } = parsed.data;
  const normalizedSlug = slug.toLowerCase();

  // Check reserved
  if (RESERVED_SLUGS.includes(normalizedSlug)) {
    return { error: "Ce slug est réservé." };
  }

  // Check availability
  const existing = await db.organization.findUnique({
    where: { slug: normalizedSlug },
  });
  if (existing) {
    return { error: "Ce slug est déjà pris." };
  }

  // Create organization + system roles + assign Admin to user
  const org = await db.$transaction(async (tx) => {
    // Ensure Free plan exists
    await tx.plan.upsert({
      where: { id: "free" },
      create: {
        id: "free",
        name: "Free",
        commissionRate: 0.05,
        monthlyFreeQuota: 30,
        monthlyPriceCents: 0,
        yearlyPriceCents: 0,
      },
      update: {},
    });

    await tx.plan.upsert({
      where: { id: "pro" },
      create: {
        id: "pro",
        name: "Pro",
        commissionRate: 0.025,
        monthlyFreeQuota: 150,
        monthlyPriceCents: 2900,
        yearlyPriceCents: 24900,
      },
      update: {},
    });

    const organization = await tx.organization.create({
      data: {
        name: organizationName,
        slug: normalizedSlug,
        subdomain: normalizedSlug,
        planId: "free",
      },
    });

    // Create system roles
    const adminRole = await tx.role.create({
      data: {
        organizationId: organization.id,
        name: "Admin",
        isSystem: true,
        permissions: [
          "EVENTS_CREATE",
          "EVENTS_EDIT",
          "EVENTS_DELETE",
          "EVENTS_PUBLISH",
          "TICKETS_VIEW",
          "TICKETS_REFUND",
          "CHECKIN_SCAN",
          "MEMBERS_INVITE",
          "MEMBERS_REMOVE",
          "MEMBERS_MANAGE_ROLES",
          "FINANCE_VIEW",
          "FINANCE_MANAGE",
          "SETTINGS_EDIT",
          "BILLING_MANAGE",
          "ROLES_CREATE",
          "ROLES_EDIT",
          "ROLES_DELETE",
        ],
      },
    });

    await tx.role.create({
      data: {
        organizationId: organization.id,
        name: "Member",
        isSystem: true,
        permissions: ["CHECKIN_SCAN", "TICKETS_VIEW"],
      },
    });

    // Assign admin role to user
    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId,
        roleId: adminRole.id,
      },
    });

    return organization;
  });

  // Apply referral code if present (fire-and-forget)
  const refCode = formData.get("refCode");
  if (refCode && typeof refCode === "string" && refCode.trim()) {
    const { applyReferralCodeAction } = await import("@/actions/referral");
    applyReferralCodeAction(refCode.trim(), org.id).catch(console.error);
  }

  return { success: true, organizationId: org.id };
}

export async function onboardingStep2Action(
  organizationId: string,
  formData: FormData
) {
  const raw = { orgType: formData.get("orgType") };
  const parsed = onboardingStep2Schema.safeParse(raw);

  if (!parsed.success) return { error: "Type d'organisation invalide." };

  await db.organization.update({
    where: { id: organizationId },
    data: { type: parsed.data.orgType },
  });

  return { success: true };
}
