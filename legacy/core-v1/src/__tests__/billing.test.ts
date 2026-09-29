import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateCommission,
  incrementTicketQuota,
  resetMonthlyQuota,
  isProPlan,
  seedPlans,
  RESERVED_SLUGS,
} from "../billing/index.js";

// Mock @evoly/db
vi.mock("@evoly/db", () => ({
  db: {
    organization: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    plan: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { db } from "@evoly/db";

const mockDb = db as unknown as {
  organization: {
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  plan: { upsert: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// seedPlans
// ---------------------------------------------------------------------------
describe("seedPlans", () => {
  it("upserts both free and pro plans", async () => {
    await seedPlans();
    expect(mockDb.plan.upsert).toHaveBeenCalledTimes(2);
  });

  it("creates the free plan with correct rates", async () => {
    await seedPlans();
    const freePlanCall = mockDb.plan.upsert.mock.calls.find(
      (c) => c[0].where.id === "free"
    );
    expect(freePlanCall).toBeDefined();
    expect(freePlanCall![0].create.commissionRate).toBe(0.05);
    expect(freePlanCall![0].create.monthlyFreeQuota).toBe(30);
    expect(freePlanCall![0].create.monthlyPriceCents).toBe(0);
  });

  it("creates the pro plan with correct rates", async () => {
    await seedPlans();
    const proPlanCall = mockDb.plan.upsert.mock.calls.find(
      (c) => c[0].where.id === "pro"
    );
    expect(proPlanCall).toBeDefined();
    expect(proPlanCall![0].create.commissionRate).toBe(0.025);
    expect(proPlanCall![0].create.monthlyFreeQuota).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// RESERVED_SLUGS
// ---------------------------------------------------------------------------
describe("RESERVED_SLUGS", () => {
  it("contains expected values", () => {
    expect(RESERVED_SLUGS).toContain("app");
    expect(RESERVED_SLUGS).toContain("api");
    expect(RESERVED_SLUGS).toContain("admin");
    expect(RESERVED_SLUGS).toContain("evoly");
    expect(RESERVED_SLUGS).toContain("auth");
    expect(RESERVED_SLUGS).toContain("login");
    expect(RESERVED_SLUGS).toContain("register");
  });

  it("is an array", () => {
    expect(Array.isArray(RESERVED_SLUGS)).toBe(true);
    expect(RESERVED_SLUGS.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// calculateCommission
// ---------------------------------------------------------------------------
describe("calculateCommission", () => {
  const makeOrg = (
    quota: number,
    alreadySold: number,
    commissionRate: number
  ) => ({
    plan: { monthlyFreeQuota: quota, commissionRate },
    ticketsSoldThisMonth: alreadySold,
  });

  it("returns 0 when all tickets are within free quota", async () => {
    mockDb.organization.findUniqueOrThrow.mockResolvedValue(
      makeOrg(30, 0, 0.05)
    );
    // 3 tickets, 1000 cents each = 3000 total. All 3 within 30-ticket quota.
    const result = await calculateCommission("org-1", 3000, 3);
    expect(result).toBe(0);
  });

  it("returns 0 when org is already at quota but buying 0 paid tickets", async () => {
    mockDb.organization.findUniqueOrThrow.mockResolvedValue(
      makeOrg(30, 28, 0.05)
    );
    // 2 tickets within free quota remaining
    const result = await calculateCommission("org-1", 2000, 2);
    expect(result).toBe(0);
  });

  it("charges commission on tickets beyond free quota (free plan 5%)", async () => {
    // 30 quota, 28 already sold → 2 remaining free. Buying 5 tickets.
    // 3 paid tickets out of 5 at 1000 cents each = 3000 commissionable
    // 5% of 3000 = 150
    mockDb.organization.findUniqueOrThrow.mockResolvedValue(
      makeOrg(30, 28, 0.05)
    );
    const result = await calculateCommission("org-1", 5000, 5);
    expect(result).toBe(150);
  });

  it("charges commission on all tickets when free quota is exhausted", async () => {
    // 30 quota, 30 already sold → 0 remaining free. Buying 4 tickets at 500 each = 2000.
    // 5% of 2000 = 100
    mockDb.organization.findUniqueOrThrow.mockResolvedValue(
      makeOrg(30, 30, 0.05)
    );
    const result = await calculateCommission("org-1", 2000, 4);
    expect(result).toBe(100);
  });

  it("applies pro plan commission rate (2.5%)", async () => {
    // Pro plan: 150 quota, 150 sold → all 3 tickets are paid.
    // 3 tickets × 1000 = 3000 commissionable, 2.5% = 75
    mockDb.organization.findUniqueOrThrow.mockResolvedValue(
      makeOrg(150, 150, 0.025)
    );
    const result = await calculateCommission("org-1", 3000, 3);
    expect(result).toBe(75);
  });

  it("handles partial quota usage correctly", async () => {
    // 30 quota, 25 sold → 5 remaining. Buying 10 tickets.
    // 5 free, 5 paid. Price = 2000/10 = 200 per ticket.
    // 5 paid tickets × 200 = 1000 commissionable, 5% = 50
    mockDb.organization.findUniqueOrThrow.mockResolvedValue(
      makeOrg(30, 25, 0.05)
    );
    const result = await calculateCommission("org-1", 2000, 10);
    expect(result).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// incrementTicketQuota
// ---------------------------------------------------------------------------
describe("incrementTicketQuota", () => {
  it("calls db.organization.update with increment", async () => {
    mockDb.organization.update.mockResolvedValue({});
    await incrementTicketQuota("org-1", 5);
    expect(mockDb.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { ticketsSoldThisMonth: { increment: 5 } },
    });
  });
});

// ---------------------------------------------------------------------------
// resetMonthlyQuota
// ---------------------------------------------------------------------------
describe("resetMonthlyQuota", () => {
  it("resets ticketsSoldThisMonth to 0 and updates quotaResetAt", async () => {
    mockDb.organization.update.mockResolvedValue({});
    await resetMonthlyQuota("org-1");
    const call = mockDb.organization.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "org-1" });
    expect(call.data.ticketsSoldThisMonth).toBe(0);
    expect(call.data.quotaResetAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// isProPlan
// ---------------------------------------------------------------------------
describe("isProPlan", () => {
  it("returns false when org not found", async () => {
    mockDb.organization.findUnique.mockResolvedValue(null);
    expect(await isProPlan("org-missing")).toBe(false);
  });

  it("returns true for pro plan with ACTIVE subscription", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      planId: "pro",
      subscriptionStatus: "ACTIVE",
    });
    expect(await isProPlan("org-1")).toBe(true);
  });

  it("returns true for pro plan with TRIALING subscription", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      planId: "pro",
      subscriptionStatus: "TRIALING",
    });
    expect(await isProPlan("org-1")).toBe(true);
  });

  it("returns false for pro plan with PAST_DUE subscription", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      planId: "pro",
      subscriptionStatus: "PAST_DUE",
    });
    expect(await isProPlan("org-1")).toBe(false);
  });

  it("returns false for free plan", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      planId: "free",
      subscriptionStatus: "ACTIVE",
    });
    expect(await isProPlan("org-1")).toBe(false);
  });
});
