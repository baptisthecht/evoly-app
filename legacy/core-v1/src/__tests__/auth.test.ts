import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  onboardingStep1Schema,
  onboardingStep2Schema,
} from "../auth/index.js";

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------
describe("registerSchema", () => {
  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "securepassword",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional name", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "securepassword",
      name: "John Doe",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "securepassword",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 100 characters", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "securepassword",
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe("loginSchema", () => {
  it("accepts valid login data", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({ password: "anypassword" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({
      email: "invalid",
      password: "anypassword",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// forgotPasswordSchema
// ---------------------------------------------------------------------------
describe("forgotPasswordSchema", () => {
  it("accepts valid email", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "notanemail" });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = forgotPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resetPasswordSchema
// ---------------------------------------------------------------------------
describe("resetPasswordSchema", () => {
  it("accepts valid token and password", () => {
    const result = resetPasswordSchema.safeParse({
      token: "some-reset-token",
      password: "newpassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = resetPasswordSchema.safeParse({
      token: "token",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 100 characters", () => {
    const result = resetPasswordSchema.safeParse({
      token: "token",
      password: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing token", () => {
    const result = resetPasswordSchema.safeParse({ password: "newpassword" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onboardingStep1Schema
// ---------------------------------------------------------------------------
describe("onboardingStep1Schema", () => {
  it("accepts valid org name and slug", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "My Org",
      slug: "my-org",
    });
    expect(result.success).toBe(true);
  });

  it("rejects slug shorter than 3 characters", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "My Org",
      slug: "ab",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug longer than 50 characters", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "My Org",
      slug: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with uppercase letters", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "My Org",
      slug: "MyOrg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "My Org",
      slug: "my org",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with special characters", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "My Org",
      slug: "my_org!",
    });
    expect(result.success).toBe(false);
  });

  it("accepts slug with numbers", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "Org 2024",
      slug: "org-2024",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty organization name", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "",
      slug: "my-org",
    });
    expect(result.success).toBe(false);
  });

  it("rejects organization name longer than 100 characters", () => {
    const result = onboardingStep1Schema.safeParse({
      organizationName: "a".repeat(101),
      slug: "my-org",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onboardingStep2Schema
// ---------------------------------------------------------------------------
describe("onboardingStep2Schema", () => {
  it("accepts INDIVIDUAL", () => {
    expect(
      onboardingStep2Schema.safeParse({ orgType: "INDIVIDUAL" }).success
    ).toBe(true);
  });

  it("accepts ASSOCIATION", () => {
    expect(
      onboardingStep2Schema.safeParse({ orgType: "ASSOCIATION" }).success
    ).toBe(true);
  });

  it("accepts COMPANY", () => {
    expect(
      onboardingStep2Schema.safeParse({ orgType: "COMPANY" }).success
    ).toBe(true);
  });

  it("rejects unknown org type", () => {
    expect(
      onboardingStep2Schema.safeParse({ orgType: "NONPROFIT" }).success
    ).toBe(false);
  });

  it("rejects missing orgType", () => {
    expect(onboardingStep2Schema.safeParse({}).success).toBe(false);
  });
});
