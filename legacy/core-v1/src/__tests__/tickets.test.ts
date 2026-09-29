import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateQrCode,
  hasAvailableStock,
  reserveStock,
  releaseStock,
  createTicketTypeSchema,
} from "../tickets/index.js";

vi.mock("@evoly/db", () => ({
  db: {
    ticketType: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@evoly/db";

const mockDb = db as unknown as {
  ticketType: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// generateQrCode
// ---------------------------------------------------------------------------
describe("generateQrCode", () => {
  it("returns a string starting with 'evt-'", () => {
    const code = generateQrCode();
    expect(code).toMatch(/^evt-/);
  });

  it("returns unique values on successive calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateQrCode()));
    expect(codes.size).toBe(50);
  });

  it("has the expected format: evt-{timestamp}-{random}", () => {
    const code = generateQrCode();
    const parts = code.split("-");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("evt");
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// hasAvailableStock
// ---------------------------------------------------------------------------
describe("hasAvailableStock", () => {
  it("returns false when ticket type does not exist", async () => {
    mockDb.ticketType.findUnique.mockResolvedValue(null);
    expect(await hasAvailableStock("tt-missing", 1)).toBe(false);
  });

  it("returns true when quantity is null (unlimited)", async () => {
    mockDb.ticketType.findUnique.mockResolvedValue({
      quantity: null,
      quantitySold: 999,
    });
    expect(await hasAvailableStock("tt-1", 100)).toBe(true);
  });

  it("returns true when enough stock is available", async () => {
    mockDb.ticketType.findUnique.mockResolvedValue({
      quantity: 100,
      quantitySold: 90,
    });
    expect(await hasAvailableStock("tt-1", 10)).toBe(true);
  });

  it("returns false when not enough stock is available", async () => {
    mockDb.ticketType.findUnique.mockResolvedValue({
      quantity: 100,
      quantitySold: 95,
    });
    expect(await hasAvailableStock("tt-1", 10)).toBe(false);
  });

  it("returns false when stock is exactly sold out", async () => {
    mockDb.ticketType.findUnique.mockResolvedValue({
      quantity: 50,
      quantitySold: 50,
    });
    expect(await hasAvailableStock("tt-1", 1)).toBe(false);
  });

  it("returns true when requesting exactly the remaining quantity", async () => {
    mockDb.ticketType.findUnique.mockResolvedValue({
      quantity: 50,
      quantitySold: 40,
    });
    expect(await hasAvailableStock("tt-1", 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reserveStock
// ---------------------------------------------------------------------------
describe("reserveStock", () => {
  it("calls db.ticketType.update with increment", async () => {
    mockDb.ticketType.update.mockResolvedValue({});
    await reserveStock("tt-1", 3);
    expect(mockDb.ticketType.update).toHaveBeenCalledWith({
      where: { id: "tt-1" },
      data: { quantitySold: { increment: 3 } },
    });
  });
});

// ---------------------------------------------------------------------------
// releaseStock
// ---------------------------------------------------------------------------
describe("releaseStock", () => {
  it("calls db.ticketType.update with decrement", async () => {
    mockDb.ticketType.update.mockResolvedValue({});
    await releaseStock("tt-1", 3);
    expect(mockDb.ticketType.update).toHaveBeenCalledWith({
      where: { id: "tt-1" },
      data: { quantitySold: { decrement: 3 } },
    });
  });
});

// ---------------------------------------------------------------------------
// createTicketTypeSchema
// ---------------------------------------------------------------------------
describe("createTicketTypeSchema", () => {
  const validInput = {
    name: "General Admission",
    priceCents: 1500,
    quantity: 100,
  };

  it("accepts valid input", () => {
    const result = createTicketTypeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createTicketTypeSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 characters", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      priceCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts free tickets (price = 0)", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      priceCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer price", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      priceCents: 15.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects quantity of 0", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("defaults currency to EUR", () => {
    const result = createTicketTypeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe("EUR");
  });

  it("defaults minPerOrder to 1", () => {
    const result = createTicketTypeSchema.safeParse(validInput);
    if (result.success) expect(result.data.minPerOrder).toBe(1);
  });

  it("defaults maxPerOrder to 10", () => {
    const result = createTicketTypeSchema.safeParse(validInput);
    if (result.success) expect(result.data.maxPerOrder).toBe(10);
  });

  it("rejects maxPerOrder above 100", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      maxPerOrder: 101,
    });
    expect(result.success).toBe(false);
  });

  it("defaults isNominative to false", () => {
    const result = createTicketTypeSchema.safeParse(validInput);
    if (result.success) expect(result.data.isNominative).toBe(false);
  });

  it("accepts valid customFields", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      customFields: [
        { label: "T-shirt size", type: "select", required: true, options: ["S", "M", "L"] },
        { label: "Dietary needs", type: "text", required: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid customField type", () => {
    const result = createTicketTypeSchema.safeParse({
      ...validInput,
      customFields: [{ label: "Field", type: "invalid", required: false }],
    });
    expect(result.success).toBe(false);
  });
});
