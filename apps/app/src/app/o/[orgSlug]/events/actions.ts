"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";
import { createEvent, deleteDraft, duplicateEvent, pauseSales, publishEvent, updateEventSettings } from "@/server/events";
import { createPromo, deletePromo, setPromoActive } from "@/server/promos";
import { cancelListingByOrganizer } from "@/server/resale";
import { cancelEvent } from "@/server/refunds";
import { saveMarketingAutomation, setReminderEnabled } from "@/server/automations";
import { moveQuestion, removeQuestion, saveQuestion } from "@/server/questions";
import { sendComplimentaryTickets, type ComplimentaryResult } from "@/server/complimentary";
import { applySeatingTemplate, deleteRow, saveCategory, setSeatChoice, setSeatingMode, toggleSeatBlocked } from "@/server/seating";
import { deleteSeatingBlock, moveTicketSeat, saveSeatingBlock, setBlockView, updateSeat, updateSeatingCategory } from "@/server/seatingEditor";
import { planFromPhoto } from "@/server/seatingPhoto";
import { applyPlan, type StoredPlan } from "@/server/seating";
import { applySeatingLayout, deleteSeatingLayout, listSeatingLayouts, saveSeatingLayout, type SeatingLayoutItem } from "@/server/seatingLayouts";
import { SEATING_TEMPLATES } from "@evoly/core";
import { NUMBERING, blockSchema, rowLabels, sInt } from "@/lib/seatingSchemas";
import { parseRecipients } from "@evoly/core";
import { createScannerLink, personalScannerLink, revokeScannerLink, scannerUrl } from "@/server/scanner";
import { createTicketType, deleteTicketType, moveTicketType, saveTiers, setTicketTypeStatus, updateTicketType } from "@/server/tickets";

const text = (max: number, message = "validation.textLength") => z.string().trim().max(max, { message });
const optionalText = (max: number) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(max, { message: "validation.textLength" }).nullable());
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "validation.datetime" });
const optionalLocalDate = z.preprocess((v) => (v === "" || v == null ? null : v), localDate.nullable());
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z
      .number({ message: "validation.number" })
      .int({ message: "validation.number" })
      .min(min, { message: "validation.number" })
      .max(max, { message: "validation.number" })
      .nullable(),
  );
const int = (min: number, max: number) =>
  z.preprocess(
    (v) => Number(v),
    z
      .number({ message: "validation.number" })
      .int({ message: "validation.number" })
      .min(min, { message: "validation.number" })
      .max(max, { message: "validation.number" }),
  );
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const price = z.string().trim().min(1, { message: "validation.required" }).max(12);

const essentials = {
  title: text(120).min(2, { message: "validation.textLength" }),
  summary: optionalText(280),
  startsAtLocal: localDate,
  endsAtLocal: optionalLocalDate,
  timezone: z.string().min(1),
  locationType: z.enum(["PHYSICAL", "ONLINE", "HYBRID"]),
  locationName: optionalText(120),
  addressLine1: optionalText(160),
  postalCode: optionalText(16),
  city: optionalText(80),
  country: optionalText(2),
  onlineUrl: optionalText(500),
};

const createSchema = z.object({
  ...essentials,
  ticketName: text(60).min(1, { message: "validation.required" }),
  ticketPrice: price,
  ticketQuantity: optionalInt(1, 1_000_000),
});

const settingsSchema = z.object({
  ...essentials,
  capacity: optionalInt(1, 1_000_000),
  maxTicketsPerOrder: int(1, 50),
  maxTicketsPerBuyer: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(200).nullable()).optional(),
  version: z.string().max(40).optional(),
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]),
  accessCode: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(40).nullable()).optional(),
  refundPolicy: z.enum(["NON_REFUNDABLE", "UNTIL_DEADLINE", "ON_REQUEST", "ALWAYS"]),
  refundDeadlineLocal: optionalLocalDate,
  salesStartLocal: optionalLocalDate,
  salesEndLocal: optionalLocalDate,
  resaleEnabled: checkbox,
  resaleCutoffMinutes: int(0, 10_080),
  showResaleSection: checkbox,
});

const ticketSchema = z.object({
  name: text(60).min(1, { message: "validation.required" }),
  description: optionalText(200),
  price,
  quantity: optionalInt(1, 1_000_000),
  minPerOrder: int(1, 50),
  maxPerOrder: int(1, 50),
  salesStartLocal: optionalLocalDate,
  salesEndLocal: optionalLocalDate,
  visibility: z.enum(["VISIBLE", "HIDDEN", "CODE_ONLY"]),
  isNominative: checkbox,
  requireHolderEmail: checkbox,
  resaleAllowed: checkbox,
});

const tiersSchema = z
  .array(
    z.object({
      id: z.string().nullish(),
      name: text(40).min(1, { message: "validation.required" }),
      price,
      startsAtLocal: optionalLocalDate,
      endsAtLocal: optionalLocalDate,
      quantityLimit: optionalInt(1, 1_000_000),
    }),
  )
  .max(10);

const eventPath = (orgSlug: string, eventId: string) => `/o/${orgSlug}/events/${eventId}`;

export async function createEventAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const result = await runOrgAction(orgSlug, formToObject(form), { schema: createSchema, permission: "EVENTS_CREATE" }, (d, ctx) =>
    createEvent(ctx, d, { name: d.ticketName, price: d.ticketPrice, quantity: d.ticketQuantity }),
  );
  if (result?.ok) redirect(eventPath(orgSlug, result.data.id));
  return result;
}

export async function saveEventSettingsAction(
  orgSlug: string,
  eventId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState<{ savedAt: string; version: string; concurrent: boolean }>> {
  const result = await runOrgAction(orgSlug, formToObject(form), { schema: settingsSchema, permission: "EVENTS_EDIT" }, async (d, ctx) => {
    const updated = await updateEventSettings(ctx, eventId, d);
    return { savedAt: new Date().toISOString(), version: updated.updatedAt.toISOString(), concurrent: updated.concurrent };
  });
  if (result?.ok) revalidatePath(eventPath(orgSlug, eventId), "layout");
  return result;
}

type EventCommand = "publish" | "pause" | "resume" | "duplicate" | "delete";

export async function eventCommandAction(orgSlug: string, eventId: string, command: EventCommand, _: ActionState): Promise<ActionState> {
  const permission = command === "duplicate" ? "EVENTS_CREATE" : command === "delete" ? "EVENTS_DELETE" : "EVENTS_PUBLISH";
  const result = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission }, async (_d, ctx) => {
    if (command === "publish" || command === "resume") await publishEvent(ctx, eventId);
    if (command === "pause") await pauseSales(ctx, eventId);
    if (command === "duplicate") return (await duplicateEvent(ctx, eventId)).id;
    if (command === "delete") await deleteDraft(ctx, eventId);
    return eventId;
  });
  if (!result?.ok) return result;
  if (command === "duplicate") redirect(eventPath(orgSlug, String(result.data)));
  if (command === "delete") redirect(`/o/${orgSlug}/events`);
  revalidatePath(eventPath(orgSlug, eventId), "layout");
  return result;
}

export async function saveTicketTypeAction(
  orgSlug: string,
  eventId: string,
  ticketTypeId: string | null,
  _: ActionState,
  form: FormData,
): Promise<ActionState<{ id: string }>> {
  const result = await runOrgAction(orgSlug, formToObject(form), { schema: ticketSchema, permission: "TICKETS_MANAGE" }, async (d, ctx) => {
    const tt = ticketTypeId ? await updateTicketType(ctx, eventId, ticketTypeId, d) : await createTicketType(ctx, eventId, d);
    return { id: tt.id };
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/tickets`);
  return result;
}

type TicketCommand = "delete" | "pause" | "activate" | "archive" | "up" | "down";

export async function ticketCommandAction(
  orgSlug: string,
  eventId: string,
  ticketTypeId: string,
  command: TicketCommand,
  _: ActionState,
): Promise<ActionState> {
  const result = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "TICKETS_MANAGE" }, async (_d, ctx) => {
    if (command === "delete") await deleteTicketType(ctx, eventId, ticketTypeId);
    if (command === "pause") await setTicketTypeStatus(ctx, eventId, ticketTypeId, "PAUSED");
    if (command === "activate") await setTicketTypeStatus(ctx, eventId, ticketTypeId, "ACTIVE");
    if (command === "archive") await setTicketTypeStatus(ctx, eventId, ticketTypeId, "ARCHIVED");
    if (command === "up" || command === "down") await moveTicketType(ctx, eventId, ticketTypeId, command);
    return null;
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/tickets`);
  return result;
}

export async function saveTiersAction(
  orgSlug: string,
  eventId: string,
  ticketTypeId: string,
  tiers: unknown,
): Promise<ActionState<{ issues: Array<{ kind: string; from: string; to: string }> }>> {
  const result = await runOrgAction(orgSlug, tiers, { schema: tiersSchema, permission: "TICKETS_MANAGE", feature: "DYNAMIC_PRICING" }, async (d, ctx) => {
    const { issues } = await saveTiers(ctx, eventId, ticketTypeId, d);
    return { issues: issues.map((i) => ({ kind: i.kind, from: i.from.toISOString(), to: i.to.toISOString() })) };
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/tickets`);
  return result;
}

const promoSchema = z.object({
  code: optionalText(32),
  discountType: z.enum(["PERCENT", "AMOUNT", "FREE"]),
  percent: optionalText(6),
  amount: optionalText(12),
  ticketTypeIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.string().max(40)).max(50)),
  maxUses: optionalInt(1, 1_000_000),
  maxUsesPerEmail: optionalInt(1, 1000),
  startsAtLocal: optionalLocalDate,
  expiresAtLocal: optionalLocalDate,
  unlocksHidden: checkbox,
});

export async function createPromoAction(orgSlug: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState<{ code: string }>> {
  const data = { ...formToObject(form), ticketTypeIds: form.getAll("ticketTypeIds").map(String) };
  const result = await runOrgAction(orgSlug, data, { schema: promoSchema, permission: "PROMO_MANAGE", feature: "PROMO_CODES" }, async (d, ctx) => ({
    code: (await createPromo(ctx, eventId, d)).code,
  }));
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/promo`);
  return result;
}

export async function promoCommandAction(
  orgSlug: string,
  eventId: string,
  promoId: string,
  command: "activate" | "deactivate" | "delete",
  _: ActionState,
): Promise<ActionState> {
  const result = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "PROMO_MANAGE" }, async (_d, ctx) => {
    if (command === "delete") await deletePromo(ctx, eventId, promoId);
    else await setPromoActive(ctx, eventId, promoId, command === "activate");
    return null;
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/promo`);
  return result;
}

const scannerLinkSchema = z.object({
  label: text(60).min(1, { message: "validation.required" }),
  duration: z.enum(["EVENT_DAY", "24H", "48H", "CUSTOM"]),
  expiresAtLocal: optionalLocalDate,
  allowManualSearch: checkbox,
});

/** US-SCN-01 : lien bénévole, sans compte. */
export async function createScannerLinkAction(orgSlug: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState<{ id: string }>> {
  const result = await runOrgAction(orgSlug, formToObject(form), { schema: scannerLinkSchema, permission: "CHECKIN_MANAGE" }, async (d, ctx) => ({
    id: (await createScannerLink(ctx, eventId, d)).id,
  }));
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/entries`);
  return result;
}

/** US-SCN-05 : révocation immédiate d'un lien. */
export async function revokeScannerLinkAction(orgSlug: string, eventId: string, linkId: string, _: ActionState): Promise<ActionState> {
  const result = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "CHECKIN_MANAGE" }, async (_d, ctx) => {
    await revokeScannerLink(ctx, eventId, linkId);
    return null;
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/entries`);
  return result;
}

/** US-SCN-06 : un membre autorisé ouvre le scanner avec son compte (lien personnel). */
export async function openScannerAction(orgSlug: string, eventId: string, _: ActionState): Promise<ActionState> {
  const result = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "CHECKIN_SCAN" },
    async (_d, ctx) => (await personalScannerLink(ctx, eventId)).id,
  );
  if (result?.ok) redirect(scannerUrl(String(result.data)));
  return result;
}

/** RG-RSL-09 : l'organisateur retire une annonce précise. */
export async function cancelListingAction(orgSlug: string, eventId: string, listingId: string, _: ActionState): Promise<ActionState> {
  const result = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "RESALE_MANAGE" }, async (_d, ctx) => {
    await cancelListingByOrganizer(ctx.organization.id, eventId, listingId, ctx.user.id);
    return null;
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/resale`);
  return result;
}

/** RG-REF-07 : annulation avec motif et saisie du titre (double confirmation). */
export async function cancelEventAction(orgSlug: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState<{ orders: number }>> {
  const schema = z.object({
    reason: text(500).min(3, { message: "validation.textLength" }),
    confirmation: text(120).min(1, { message: "validation.required" }),
  });
  const result = await runOrgAction(orgSlug, formToObject(form), { schema, permission: "EVENTS_CANCEL" }, async (d, ctx) => ({
    orders: (await cancelEvent(ctx, eventId, d.reason, d.confirmation)).orders,
  }));
  if (result?.ok) revalidatePath(eventPath(orgSlug, eventId), "layout");
  return result;
}

/** US-MKT-01 : activer ou couper un rappel automatique de l'événement (Pro). */
export async function reminderAction(
  orgSlug: string,
  eventId: string,
  type: "REMINDER_J7" | "REMINDER_J1" | "REMINDER_J0",
  enabled: boolean,
): Promise<ActionState> {
  const result = await runOrgAction(
    orgSlug,
    { type, enabled },
    {
      schema: z.object({ type: z.enum(["REMINDER_J7", "REMINDER_J1", "REMINDER_J0"]), enabled: z.boolean() }),
      permission: "MARKETING_MANAGE",
      feature: "EMAIL_MARKETING",
    },
    async (d, ctx) => {
      await setReminderEnabled(ctx, eventId, d.type, d.enabled);
      return null;
    },
  );
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/settings`);
  return result;
}

/** US-MKT-02 et dernières places : activation, objet et message (Pro). */
export async function marketingAutomationAction(
  orgSlug: string,
  eventId: string,
  type: "POST_EVENT" | "LAST_TICKETS",
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const schema = z.object({
    enabled: z.preprocess((v) => v === "on", z.boolean()),
    subject: text(150).min(2, { message: "validation.textLength" }),
    content: z.string().transform((v, c) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        c.addIssue({ code: "custom", message: "validation.textLength" });
        return z.NEVER;
      }
    }),
  });
  const result = await runOrgAction(orgSlug, formToObject(form), { schema, permission: "MARKETING_MANAGE", feature: "EMAIL_MARKETING" }, async (d, ctx) => {
    await saveMarketingAutomation(ctx, eventId, type, d);
    return null;
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/settings`);
  return result;
}

/** US-QST-01 : création ou modification d'une question à l'achat. */
export async function saveQuestionAction(orgSlug: string, eventId: string, questionId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const data = { ...formToObject(form), ticketTypeIds: form.getAll("ticketTypeIds").map(String), required: form.get("required") === "on" };
  const schema = z.object({
    label: text(200),
    helpText: text(300).optional(),
    type: z.string().max(20),
    options: text(3000).optional(),
    required: z.boolean(),
    scope: z.enum(["ORDER", "TICKET"]),
    ticketTypeIds: z.array(z.string().max(40)).max(50),
  });
  const result = await runOrgAction(orgSlug, data, { schema, permission: "TICKETS_MANAGE" }, async (d, ctx) => {
    await saveQuestion(ctx, eventId, questionId, d);
    return null;
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/tickets`);
  return result;
}

export async function questionCommandAction(
  orgSlug: string,
  eventId: string,
  questionId: string,
  command: "up" | "down" | "remove",
): Promise<ActionState<{ outcome: string }>> {
  const result = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "TICKETS_MANAGE" }, async (_d, ctx) => {
    if (command === "remove") return { outcome: await removeQuestion(ctx, eventId, questionId) };
    await moveQuestion(ctx, eventId, questionId, command === "up" ? -1 : 1);
    return { outcome: "MOVED" };
  });
  if (result?.ok) revalidatePath(`${eventPath(orgSlug, eventId)}/tickets`);
  return result;
}

/** US-ORD-03 : billets offerts à une liste d'adresses. */
export async function complimentaryAction(
  orgSlug: string,
  eventId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState<{ results: ComplimentaryResult[]; invalid: Array<{ line: number; value: string }>; tooMany: boolean }>> {
  const parsed = parseRecipients(String(form.get("recipients") ?? "").slice(0, 60_000));
  const schema = z.object({ ticketTypeId: z.string().min(1).max(40), quantityEach: z.coerce.number().int().min(1).max(10) });
  const result = await runOrgAction(orgSlug, formToObject(form), { schema, permission: "ORDERS_MANAGE" }, async (d, ctx) => {
    if (parsed.recipients.length === 0) return { results: [], invalid: parsed.errors, tooMany: parsed.tooMany };
    return {
      results: await sendComplimentaryTickets(ctx, eventId, { ticketTypeId: d.ticketTypeId, quantityEach: d.quantityEach, recipients: parsed.recipients }),
      invalid: parsed.errors,
      tooMany: parsed.tooMany,
    };
  });
  if (result?.ok) revalidatePath(eventPath(orgSlug, eventId), "layout");
  return result;
}

// -- plan de salle (section 9.9, Pro) --
const SEATING = { permission: "TICKETS_MANAGE", feature: "SEATING_MAPS" } as const;
const seatingDone = (orgSlug: string, eventId: string) => {
  revalidatePath(`${eventPath(orgSlug, eventId)}/seating`);
  revalidatePath(`${eventPath(orgSlug, eventId)}/tickets`);
};

export async function seatingCommandAction(
  orgSlug: string,
  eventId: string,
  command: { kind: "seat"; id: string } | { kind: "row"; id: string } | { kind: "mode"; assigned: boolean } | { kind: "choice"; allow: boolean },
): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), ...SEATING }, async (_d, ctx) => {
    if (command.kind === "seat") await toggleSeatBlocked(ctx, eventId, command.id);
    else if (command.kind === "row") await deleteRow(ctx, eventId, command.id);
    else if (command.kind === "choice") await setSeatChoice(ctx, eventId, command.allow);
    else await setSeatingMode(ctx, eventId, command.assigned);
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

// -- éditeur visuel du plan de salle --
export async function seatingTemplateAction(orgSlug: string, eventId: string, input: unknown): Promise<ActionState> {
  const schema = z.object({
    template: z.enum(SEATING_TEMPLATES),
    options: z
      .object({
        rows: sInt(1, 100),
        seatsFirst: sInt(1, 200),
        seatsLast: sInt(1, 200),
        balconyRows: sInt(0, 30),
        centerAisle: z.boolean(),
        numbering: NUMBERING,
        rowLabels,
        categories: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        tables: sInt(1, 200),
        seatsPerTable: sInt(1, 30),
      })
      .partial(),
  });
  const r = await runOrgAction(orgSlug, input, { schema, ...SEATING }, async (d, ctx) => {
    await applySeatingTemplate(ctx, eventId, d.template, d.options);
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingBlockAction(orgSlug: string, eventId: string, input: unknown): Promise<ActionState<{ id: string }>> {
  const r = await runOrgAction(orgSlug, input, { schema: blockSchema, ...SEATING }, async (d, ctx) => ({ id: await saveSeatingBlock(ctx, eventId, d) }));
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingBlockDeleteAction(orgSlug: string, eventId: string, blockId: string): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, { blockId }, { schema: z.object({ blockId: z.string().min(1).max(40) }), ...SEATING }, async (d, ctx) => {
    await deleteSeatingBlock(ctx, eventId, d.blockId);
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingSeatAction(orgSlug: string, eventId: string, seatId: string, patch: unknown): Promise<ActionState> {
  const schema = z.object({
    seatId: z.string().min(1).max(40),
    patch: z
      .object({ label: z.string().trim().min(1).max(12), blocked: z.boolean(), accessible: z.boolean(), note: z.string().trim().max(80).nullable() })
      .partial(),
  });
  const r = await runOrgAction(orgSlug, { seatId, patch }, { schema, ...SEATING }, async (d, ctx) => {
    await updateSeat(ctx, eventId, d.seatId, d.patch);
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingCategoryUpdateAction(orgSlug: string, eventId: string, categoryId: string, input: unknown): Promise<ActionState> {
  const schema = z.object({
    categoryId: z.string().min(1).max(40),
    input: z.object({
      name: text(40).min(1, { message: "validation.textLength" }),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      ticketTypeIds: z.array(z.string().max(40)).max(50),
    }),
  });
  const r = await runOrgAction(orgSlug, { categoryId, input }, { schema, ...SEATING }, async (d, ctx) => {
    await updateSeatingCategory(ctx, eventId, d.categoryId, d.input);
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingCategoryAddAction(orgSlug: string, eventId: string, input: unknown): Promise<ActionState> {
  const schema = z.object({ name: text(40).min(1, { message: "validation.textLength" }), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
  const r = await runOrgAction(orgSlug, input, { schema, ...SEATING }, async (d, ctx) => {
    await saveCategory(ctx, eventId, { ...d, ticketTypeId: null });
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingMoveAction(orgSlug: string, eventId: string, fromSeatId: string, toSeatId: string): Promise<ActionState> {
  const schema = z.object({ fromSeatId: z.string().min(1).max(40), toSeatId: z.string().min(1).max(40) });
  const r = await runOrgAction(orgSlug, { fromSeatId, toSeatId }, { schema, ...SEATING }, async (d, ctx) => {
    await moveTicketSeat(ctx, eventId, d.fromSeatId, d.toSeatId);
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingLayoutSaveAction(orgSlug: string, eventId: string, input: unknown): Promise<ActionState<{ id: string }>> {
  const schema = z.object({ name: text(60).min(1, { message: "validation.textLength" }), city: z.string().trim().max(60).nullable(), shared: z.boolean() });
  return runOrgAction(orgSlug, input, { schema, ...SEATING }, async (d, ctx) => ({ id: await saveSeatingLayout(ctx, eventId, d) }));
}

export async function seatingLayoutApplyAction(orgSlug: string, eventId: string, layoutId: string): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, { layoutId }, { schema: z.object({ layoutId: z.string().min(1).max(40) }), ...SEATING }, async (d, ctx) => {
    await applySeatingLayout(ctx, eventId, d.layoutId);
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingLayoutDeleteAction(orgSlug: string, layoutId: string): Promise<ActionState> {
  return runOrgAction(orgSlug, { layoutId }, { schema: z.object({ layoutId: z.string().min(1).max(40) }), ...SEATING }, async (d, ctx) => {
    await deleteSeatingLayout(ctx, d.layoutId);
    return null;
  });
}

export async function seatingLayoutSearchAction(orgSlug: string, query: string): Promise<ActionState<SeatingLayoutItem[]>> {
  return runOrgAction(orgSlug, { query }, { schema: z.object({ query: z.string().max(60) }), ...SEATING, write: false }, async (d, ctx) =>
    listSeatingLayouts(ctx, d.query),
  );
}

export async function seatingViewAction(
  orgSlug: string,
  eventId: string,
  blockId: string,
  form: FormData | null,
): Promise<ActionState<{ url: string | null }>> {
  const file = form?.get("photo");
  const bytes = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : null;
  if (form && !bytes) return { ok: false, error: "UPLOAD_TYPE" };
  const r = await runOrgAction(orgSlug, { blockId }, { schema: z.object({ blockId: z.string().min(1).max(40) }), ...SEATING }, async (d, ctx) => ({
    url: await setBlockView(ctx, eventId, d.blockId, bytes),
  }));
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}

export async function seatingPhotoAction(orgSlug: string, eventId: string, form: FormData): Promise<ActionState<StoredPlan>> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "UPLOAD_TYPE" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return runOrgAction(orgSlug, {}, { schema: z.object({}), ...SEATING }, async (_d, ctx) => planFromPhoto(ctx, eventId, bytes));
}

export async function seatingPhotoApplyAction(orgSlug: string, eventId: string, plan: unknown): Promise<ActionState> {
  const schema = z.object({
    categories: z
      .array(z.object({ key: z.string().max(10), name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
      .min(1)
      .max(3),
    blocks: z.array(blockSchema).min(1).max(40),
    focus: z.object({ x: z.number().min(-20000).max(20000), y: z.number().min(-20000).max(20000) }),
  });
  const r = await runOrgAction(orgSlug, plan, { schema, ...SEATING }, async (d, ctx) => {
    await applyPlan(ctx, eventId, d as unknown as StoredPlan, "photo");
    return null;
  });
  if (r?.ok) seatingDone(orgSlug, eventId);
  return r;
}
