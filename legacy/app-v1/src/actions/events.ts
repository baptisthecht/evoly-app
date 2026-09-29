"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { generateUniqueEventSlug } from "@evoly/core/events";
import { z } from "zod";
import { revalidatePath } from "next/cache";

// ─────────────────────────────────────────
// WIZARD — STEP 1 : INFOS DE BASE
// ─────────────────────────────────────────

const step1Schema = z.object({
  title: z.string().min(1, "Le titre est requis").max(200),
  description: z.string().optional(),
  startsAt: z.string().min(1, "La date de début est requise"),
  startsAtTime: z.string().min(1, "L'heure de début est requise"),
  endsAt: z.string().nullable().optional(),
  endsAtTime: z.string().nullable().optional(),
  timezone: z.string().default("Europe/Paris"),
});

const step2Schema = z.object({
  locationType: z.enum(["PHYSICAL", "ONLINE", "HYBRID"]),
  locationName: z.string().optional(),
  locationAddress: z.string().optional(),
  locationLat: z.coerce.number().optional(),
  locationLng: z.coerce.number().optional(),
  streamUrl: z.string().url("URL invalide").optional().or(z.literal("")).nullable().optional(),
});

// ─────────────────────────────────────────
// CREATE EVENT (from wizard)
// ─────────────────────────────────────────

export async function createEventAction(
  organizationId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_CREATE");

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true, timezone: true },
  });
  if (!org) return { error: "Organisation introuvable." };

  // Parse step 1
  const raw1 = {
    title: formData.get("title"),
    description: formData.get("description"),
    startsAt: formData.get("startsAt"),
    startsAtTime: formData.get("startsAtTime"),
    endsAt: formData.get("endsAt"),
    endsAtTime: formData.get("endsAtTime"),
    timezone: formData.get("timezone") ?? org.timezone,
  };

  const parsed1 = step1Schema.safeParse(raw1);
  if (!parsed1.success) {
    return { error: "Données invalides.", fieldErrors: parsed1.error.flatten().fieldErrors };
  }

  // Parse step 2
  const raw2 = {
    locationType: formData.get("locationType"),
    locationName: formData.get("locationName"),
    locationAddress: formData.get("locationAddress"),
    locationLat: formData.get("locationLat"),
    locationLng: formData.get("locationLng"),
    streamUrl: formData.get("streamUrl"),
  };

  const parsed2 = step2Schema.safeParse(raw2);
  if (!parsed2.success) {
    return { error: "Données de lieu invalides.", fieldErrors: parsed2.error.flatten().fieldErrors };
  }

  const { title, description, startsAt, startsAtTime, endsAt, endsAtTime, timezone } = parsed1.data;
  const { locationType, locationName, locationAddress, locationLat, locationLng, streamUrl } = parsed2.data;

  // Build dates
  const startsAtDate = new Date(`${startsAt}T${startsAtTime}`);
  const endsAtDate = endsAt && endsAtTime ? new Date(`${endsAt}T${endsAtTime}`) : undefined;

  if (isNaN(startsAtDate.getTime())) {
    return { error: "Date de début invalide." };
  }

  // Generate unique slug
  const slug = await generateUniqueEventSlug(organizationId, title);

  const event = await db.event.create({
    data: {
      organizationId,
      slug,
      title,
      description: description || null,
      locationType,
      locationName: locationName || null,
      locationAddress: locationAddress || null,
      locationLat: locationLat ?? null,
      locationLng: locationLng ?? null,
      streamUrl: streamUrl || null,
      startsAt: startsAtDate,
      endsAt: endsAtDate ?? null,
      timezone,
      status: "DRAFT",
    },
  });

  return { success: true, eventSlug: event.slug };
}

// ─────────────────────────────────────────
// AUTOSAVE (debounced from wizard)
// ─────────────────────────────────────────

export async function autosaveEventAction(
  eventId: string,
  organizationId: string,
  data: Partial<{
    title: string;
    description: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    locationType: string;
    locationName: string;
    locationAddress: string;
    streamUrl: string;
  }>
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  await db.event.update({
    where: { id: eventId, organizationId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
      ...(data.endsAt !== undefined && { endsAt: new Date(data.endsAt) }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
      ...(data.locationType !== undefined && { locationType: data.locationType as any }),
      ...(data.locationName !== undefined && { locationName: data.locationName }),
      ...(data.locationAddress !== undefined && { locationAddress: data.locationAddress }),
      ...(data.streamUrl !== undefined && { streamUrl: data.streamUrl }),
    },
  });

  return { success: true };
}

// ─────────────────────────────────────────
// PUBLISH / UNPUBLISH
// ─────────────────────────────────────────

export async function publishEventAction(eventId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_PUBLISH");

  // Check has at least one ticket type
  const ticketCount = await db.ticketType.count({
    where: { eventId, status: "ACTIVE" },
  });

  if (ticketCount === 0) {
    return { error: "Ajoutez au moins un type de ticket avant de publier." };
  }

  await db.event.update({
    where: { id: eventId, organizationId },
    data: { status: "PUBLISHED" },
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}

export async function unpublishEventAction(eventId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_PUBLISH");

  await db.event.update({
    where: { id: eventId, organizationId },
    data: { status: "DRAFT" },
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}

// ─────────────────────────────────────────
// CANCEL EVENT
// ─────────────────────────────────────────

export async function cancelEventAction(eventId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_DELETE");

  await db.event.update({
    where: { id: eventId, organizationId },
    data: { status: "CANCELLED" },
  });

  // TODO Phase 5: trigger automatic refunds via Stripe

  revalidatePath(`/dashboard`);
  return { success: true };
}

// ─────────────────────────────────────────
// DUPLICATE EVENT
// ─────────────────────────────────────────

export async function duplicateEventAction(eventId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_CREATE");

  const source = await db.event.findUnique({
    where: { id: eventId, organizationId },
    include: { ticketTypes: true },
  });

  if (!source) return { error: "Événement introuvable." };

  const newSlug = await generateUniqueEventSlug(organizationId, `${source.title} (copie)`);

  const newEvent = await db.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        organizationId,
        slug: newSlug,
        title: `${source.title} (copie)`,
        description: source.description,
        bannerUrl: source.bannerUrl,
        locationType: source.locationType,
        locationName: source.locationName,
        locationAddress: source.locationAddress,
        locationLat: source.locationLat,
        locationLng: source.locationLng,
        streamUrl: source.streamUrl,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        timezone: source.timezone,
        status: "DRAFT",
        seatingType: source.seatingType,
        allowSeatChoice: source.allowSeatChoice,
        primaryColor: source.primaryColor,
        accentColor: source.accentColor,
        visibility: source.visibility,
        refundPolicy: source.refundPolicy,
        refundDeadlineDays: source.refundDeadlineDays,
      },
    });

    // Duplicate ticket types (reset quantities sold)
    for (const tt of source.ticketTypes) {
      await tx.ticketType.create({
        data: {
          eventId: event.id,
          name: tt.name,
          description: tt.description,
          priceCents: tt.priceCents,
          currency: tt.currency,
          quantity: tt.quantity,
          quantitySold: 0,
          status: "ACTIVE",
          saleStartsAt: tt.saleStartsAt,
          saleEndsAt: tt.saleEndsAt,
          minPerOrder: tt.minPerOrder,
          maxPerOrder: tt.maxPerOrder,
          sortOrder: tt.sortOrder,
          isNominative: tt.isNominative,
          customFields: tt.customFields ?? undefined,
        },
      });
    }

    return event;
  });

  return { success: true, eventSlug: newEvent.slug };
}

// ─────────────────────────────────────────
// UPDATE EVENT SETTINGS
// ─────────────────────────────────────────

const updateSettingsSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  startsAt: z.string().optional(),
  startsAtTime: z.string().optional(),
  endsAt: z.string().nullable().optional(),
  endsAtTime: z.string().nullable().optional(),
  refundPolicy: z.enum(["NON_REFUNDABLE", "ORGANIZER_DEFINED", "ALWAYS_REFUNDABLE"]).optional(),
  refundDeadlineDays: z.coerce.number().int().min(0).optional(),
  visibility: z.enum(["PUBLIC", "UNLISTED"]).optional(),
  confirmationMessage: z.string().optional(),
});

export async function updateEventSettingsAction(
  eventId: string,
  organizationId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié." };

  await requirePermission(session.user.id, organizationId, "EVENTS_EDIT");

  const raw = Object.fromEntries(formData.entries());
  const parsed = updateSettingsSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données invalides." };

  const { startsAt, startsAtTime, endsAt, endsAtTime, ...rest } = parsed.data;

  const updateData: any = { ...rest };

  if (startsAt && startsAtTime) {
    updateData.startsAt = new Date(`${startsAt}T${startsAtTime}`);
  }
  if (endsAt && endsAtTime) {
    updateData.endsAt = new Date(`${endsAt}T${endsAtTime}`);
  } else if (endsAt === "") {
    updateData.endsAt = null;
  }

  await db.event.update({
    where: { id: eventId, organizationId },
    data: updateData,
  });

  revalidatePath(`/dashboard`);
  return { success: true };
}
