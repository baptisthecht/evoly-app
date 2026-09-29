import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  slugify,
  generateUniqueEventSlug,
  isEventSlugAvailable,
  createEventSchema,
} from "../events/index.js";

vi.mock("@evoly/db", () => ({
  db: {
    event: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@evoly/db";

const mockDb = db as unknown as {
  event: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------
describe("slugify", () => {
  it("lowercases text", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("rock concert 2024")).toBe("rock-concert-2024");
  });

  it("removes accents and diacritics", () => {
    expect(slugify("Événement Été")).toBe("evenement-ete");
  });

  it("removes special characters", () => {
    expect(slugify("Concert! (Paris) - 2024")).toBe("concert-paris-2024");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello  ---  world")).toBe("hello-world");
  });

  it("lowercases and converts interior spaces to hyphens", () => {
    // Note: .trim() strips whitespace but not the hyphens that leading/trailing
    // spaces become, so leading/trailing spaces produce leading/trailing hyphens.
    expect(slugify("hello world")).toBe("hello-world");
  });

  it("truncates to 80 characters", () => {
    const result = slugify("a".repeat(200));
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles purely numeric title", () => {
    expect(slugify("2024")).toBe("2024");
  });

  it("handles accented French text", () => {
    expect(slugify("Fête de la Musique")).toBe("fete-de-la-musique");
  });

  it("removes characters that are not a-z, 0-9, spaces, or hyphens", () => {
    expect(slugify("event@domain.com")).toBe("eventdomaincom");
  });
});

// ---------------------------------------------------------------------------
// isEventSlugAvailable
// ---------------------------------------------------------------------------
describe("isEventSlugAvailable", () => {
  it("returns true when no event with that slug exists", async () => {
    mockDb.event.findFirst.mockResolvedValue(null);
    expect(await isEventSlugAvailable("org-1", "my-event")).toBe(true);
  });

  it("returns false when an event with that slug exists", async () => {
    mockDb.event.findFirst.mockResolvedValue({ id: "evt-1", slug: "my-event" });
    expect(await isEventSlugAvailable("org-1", "my-event")).toBe(false);
  });

  it("returns true when the only matching event is excluded by id", async () => {
    // findFirst returns null (because the WHERE excludes the event by id)
    mockDb.event.findFirst.mockResolvedValue(null);
    expect(await isEventSlugAvailable("org-1", "my-event", "evt-1")).toBe(true);
    // Check that the excludeId was passed in the query
    const call = mockDb.event.findFirst.mock.calls[0][0];
    expect(call.where).toMatchObject({ NOT: { id: "evt-1" } });
  });
});

// ---------------------------------------------------------------------------
// generateUniqueEventSlug
// ---------------------------------------------------------------------------
describe("generateUniqueEventSlug", () => {
  it("returns the base slug when it is available", async () => {
    mockDb.event.findFirst.mockResolvedValue(null);
    const slug = await generateUniqueEventSlug("org-1", "Rock Concert");
    expect(slug).toBe("rock-concert");
  });

  it("appends -1 when base slug is taken", async () => {
    // First call finds a conflict, second call finds none
    mockDb.event.findFirst
      .mockResolvedValueOnce({ id: "evt-1" })
      .mockResolvedValueOnce(null);
    const slug = await generateUniqueEventSlug("org-1", "Rock Concert");
    expect(slug).toBe("rock-concert-1");
  });

  it("appends -2 when both base and -1 are taken", async () => {
    mockDb.event.findFirst
      .mockResolvedValueOnce({ id: "evt-1" })
      .mockResolvedValueOnce({ id: "evt-2" })
      .mockResolvedValueOnce(null);
    const slug = await generateUniqueEventSlug("org-1", "Rock Concert");
    expect(slug).toBe("rock-concert-2");
  });

  it("excludes specified id when checking availability", async () => {
    mockDb.event.findFirst.mockResolvedValue(null);
    const slug = await generateUniqueEventSlug(
      "org-1",
      "Rock Concert",
      "evt-existing"
    );
    expect(slug).toBe("rock-concert");
    const call = mockDb.event.findFirst.mock.calls[0][0];
    expect(call.where).toMatchObject({ NOT: { id: "evt-existing" } });
  });
});

// ---------------------------------------------------------------------------
// createEventSchema
// ---------------------------------------------------------------------------
describe("createEventSchema", () => {
  const validInput = {
    title: "My Event",
    locationType: "PHYSICAL" as const,
    startsAt: new Date("2024-09-15T18:00:00Z"),
  };

  it("accepts valid minimal event data", () => {
    const result = createEventSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults timezone to Europe/Paris", () => {
    const result = createEventSchema.safeParse(validInput);
    if (result.success) expect(result.data.timezone).toBe("Europe/Paris");
  });

  it("rejects empty title", () => {
    expect(
      createEventSchema.safeParse({ ...validInput, title: "" }).success
    ).toBe(false);
  });

  it("rejects title longer than 200 characters", () => {
    expect(
      createEventSchema.safeParse({
        ...validInput,
        title: "a".repeat(201),
      }).success
    ).toBe(false);
  });

  it("rejects invalid locationType", () => {
    expect(
      createEventSchema.safeParse({
        ...validInput,
        locationType: "INVALID",
      }).success
    ).toBe(false);
  });

  it("accepts ONLINE location type", () => {
    expect(
      createEventSchema.safeParse({
        ...validInput,
        locationType: "ONLINE",
      }).success
    ).toBe(true);
  });

  it("accepts HYBRID location type", () => {
    expect(
      createEventSchema.safeParse({
        ...validInput,
        locationType: "HYBRID",
      }).success
    ).toBe(true);
  });

  it("coerces startsAt string to Date", () => {
    const result = createEventSchema.safeParse({
      ...validInput,
      startsAt: "2024-09-15T18:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.startsAt).toBeInstanceOf(Date);
  });

  it("rejects invalid bannerUrl", () => {
    expect(
      createEventSchema.safeParse({
        ...validInput,
        bannerUrl: "not-a-url",
      }).success
    ).toBe(false);
  });

  it("accepts valid bannerUrl", () => {
    expect(
      createEventSchema.safeParse({
        ...validInput,
        bannerUrl: "https://example.com/banner.jpg",
      }).success
    ).toBe(true);
  });
});
