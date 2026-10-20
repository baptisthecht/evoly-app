import { normalizePromotionCode, zonedLocalToUtc } from "@evoly/core";
import { z } from "zod";
import type { PromotionInput } from "./promotions";

export const OFFER_LOCALES = ["fr", "en", "nl", "de", "es", "it", "pt"] as const;
const TYPES = ["INDIVIDUAL", "ASSOCIATION", "COMPANY", "PUBLIC_BODY"] as const;
const local = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .optional()
  .or(z.literal(""));
const int = (min: number, max: number) => z.coerce.number({ message: "validation.number" }).int().min(min).max(max);
const list = (s: string | undefined) =>
  (s ?? "")
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const schema = z.object({
  code: z.string().transform((v, c) => normalizePromotionCode(v) ?? (c.addIssue({ code: "custom", message: "validation.code" }), z.NEVER)),
  name: z.string().trim().min(2, { message: "validation.required" }).max(80),
  note: z.string().trim().max(500).optional(),
  planId: z.enum(["pro"]),
  durationValue: int(1, 1095),
  durationUnit: z.enum(["DAY", "MONTH"]),
  startsAtLocal: local,
  endsAtLocal: local,
  audience: z.enum(["ALL_NEW", "LINK"]),
  countries: z.string().optional(),
  sources: z.string().optional(),
  maxRedemptions: z.union([z.literal(""), int(1, 1_000_000)]).optional(),
  perOwnerLimit: int(1, 50),
  priority: int(-100, 100),
});

/** Lecture et contrôle du formulaire de l'administration ; erreurs par champ, sinon l'offre prête à enregistrer. */
export function parsePromotionForm(form: FormData): { ok: true; data: PromotionInput } | { ok: false; fields: Record<string, string> } {
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = schema.safeParse(raw);
  const fields: Record<string, string> = {};
  if (!parsed.success)
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message.startsWith("validation.") ? i.message : "validation.invalid";
  const d = parsed.success ? parsed.data : null;
  const countries = list(raw.countries).map((c) => c.toUpperCase());
  if (countries.some((c) => !/^[A-Z]{2}$/.test(c))) fields.countries = "validation.invalid";
  const sources = list(raw.sources).map((s) => s.toLowerCase());
  if (sources.some((s) => !/^[a-z0-9._-]{1,40}$/.test(s))) fields.sources = "validation.invalid";
  const organizationTypes = form.getAll("organizationTypes").filter((t): t is (typeof TYPES)[number] => (TYPES as readonly string[]).includes(String(t)));
  // contrôles indépendants du reste : toutes les erreurs s'affichent en même temps
  const at = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? zonedLocalToUtc(v, "Europe/Brussels") : null);
  const startsAt = at(raw.startsAtLocal);
  const endsAt = at(raw.endsAtLocal);
  if (startsAt && endsAt && endsAt <= startsAt) fields.endsAtLocal = "validation.endBeforeStart";
  if (raw.durationUnit === "MONTH" && Number(raw.durationValue) > 36) fields.durationValue = "validation.number";
  const messages: PromotionInput["messages"] = {};
  for (const l of OFFER_LOCALES) {
    const banner = (raw[`msg_${l}_banner`] ?? "").trim();
    const short = (raw[`msg_${l}_short`] ?? "").trim();
    const cta = (raw[`msg_${l}_cta`] ?? "").trim();
    if (banner.length > 300) fields[`msg_${l}_banner`] = "validation.tooLong";
    if (short.length > 120) fields[`msg_${l}_short`] = "validation.tooLong";
    if (cta.length > 60) fields[`msg_${l}_cta`] = "validation.tooLong";
    if (banner) messages[l] = { banner, short, cta };
  }
  const showOnSite = form.get("showOnSite") === "on";
  if (showOnSite && !messages.fr) fields.msg_fr_banner = "validation.required"; // une offre annoncée a au moins son bandeau en français
  if (Object.keys(fields).length || !d) return { ok: false, fields };
  return {
    ok: true,
    data: {
      code: d.code,
      name: d.name,
      note: d.note || null,
      active: form.get("active") === "on",
      planId: d.planId,
      durationValue: d.durationValue,
      durationUnit: d.durationUnit,
      startsAt,
      endsAt,
      audience: d.audience,
      countries,
      organizationTypes,
      sources,
      maxRedemptions: d.maxRedemptions === "" || d.maxRedemptions === undefined ? null : d.maxRedemptions,
      perOwnerLimit: d.perOwnerLimit,
      priority: d.priority,
      showOnSite,
      messages,
    },
  };
}
