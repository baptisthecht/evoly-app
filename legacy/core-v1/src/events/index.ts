import { db } from "@evoly/db";
import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  bannerUrl: z.string().url().optional(),
  locationType: z.enum(["PHYSICAL", "ONLINE", "HYBRID"]),
  locationName: z.string().optional(),
  locationAddress: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  streamUrl: z.string().url().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  timezone: z.string().default("Europe/Paris"),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * Generate a unique slug for an event within an organization.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 80);
}

/**
 * Ensure slug uniqueness within an org, appending a suffix if needed.
 */
export async function generateUniqueEventSlug(
  organizationId: string,
  title: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(title);
  let slug = base;
  let suffix = 1;

  while (true) {
    const existing = await db.event.findFirst({
      where: {
        organizationId,
        slug,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    if (!existing) break;
    slug = `${base}-${suffix++}`;
  }

  return slug;
}

/**
 * Check if a slug is available within an org.
 */
export async function isEventSlugAvailable(
  organizationId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await db.event.findFirst({
    where: {
      organizationId,
      slug,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  return !existing;
}
