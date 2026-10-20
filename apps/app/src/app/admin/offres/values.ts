import type { Promotion } from "@evoly/db";
import type { PromotionFormValues } from "./PromotionForm";

/** Date affichée dans le formulaire, en heure de Bruxelles (« AAAA-MM-JJTHH:MM »). */
export const brusselsInput = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .format(d)
        .replace(" ", "T")
    : "";

export const emptyPromotion: PromotionFormValues = {
  code: "",
  name: "",
  note: "",
  active: true,
  durationValue: 3,
  durationUnit: "MONTH",
  startsAtLocal: "",
  endsAtLocal: "",
  audience: "ALL_NEW",
  countries: "",
  organizationTypes: [],
  sources: "",
  maxRedemptions: "",
  perOwnerLimit: 1,
  priority: 0,
  showOnSite: true,
  messages: {},
};

export function promotionValues(p: Promotion): PromotionFormValues {
  return {
    code: p.code,
    name: p.name,
    note: p.note ?? "",
    active: p.active,
    durationValue: p.durationValue,
    durationUnit: p.durationUnit,
    startsAtLocal: brusselsInput(p.startsAt),
    endsAtLocal: brusselsInput(p.endsAt),
    audience: p.audience,
    countries: p.countries.join(", "),
    organizationTypes: p.organizationTypes,
    sources: p.sources.join(", "),
    maxRedemptions: p.maxRedemptions === null ? "" : String(p.maxRedemptions),
    perOwnerLimit: p.perOwnerLimit,
    priority: p.priority,
    showOnSite: p.showOnSite,
    messages: (p.messages ?? {}) as PromotionFormValues["messages"],
  };
}
