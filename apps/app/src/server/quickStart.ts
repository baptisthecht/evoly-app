import { CoreError, slugify, type Acquisition } from "@evoly/core";
import { findOrgContext, type OrgContext } from "./context";
import { createEvent } from "./events";
import { createOrganization } from "./onboarding";

export type OrganizationKind =
  "ASSOCIATION" | "COMPANY" | "INDIVIDUAL" | "PUBLIC_BODY";
export interface StarterEvent {
  title: string;
  startsAtLocal: string;
  locationName: string;
  addressLine1?: string;
  postalCode?: string;
  city: string;
  /** Pays du lieu (ISO), sinon la Belgique. */
  country?: string;
  /** « 0 » : billets gratuits. */
  price: string;
  /** Aucune : places illimitées. */
  quantity: number | null;
}

/**
 * Création rapide (visiteurs des annonces) : l'organisation et son premier événement, en brouillon, d'un seul coup.
 * L'adresse de l'organisation vient de son nom ; si elle est prise, une variante est choisie.
 */
export async function createStarterOrganizationAndEvent(
  user: { id: string; name: string; email: string },
  org: { name: string; type: OrganizationKind },
  ev: StarterEvent,
  acquisition: Acquisition | null,
) {
  const base =
    (slugify(org.name) || "organisation").slice(0, 40).replace(/-+$/, "") ||
    "organisation";
  let created: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 6 && !created; attempt++) {
    const subdomain =
      attempt === 0
        ? base
        : `${base.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      created = await createOrganization(
        user.id,
        { name: org.name, subdomain, country: "BE", type: org.type } as never,
        acquisition,
      );
    } catch (e) {
      if (!(e instanceof CoreError && String(e.code).startsWith("SUBDOMAIN_")))
        throw e;
    }
  }
  if (!created) throw new CoreError("SUBDOMAIN_TAKEN");
  const ctx = {
    ...(await findOrgContext(user.id, created.slug))!,
    user,
  } as OrgContext;
  const event = await createEvent(
    ctx,
    {
      title: ev.title,
      summary: "",
      startsAtLocal: ev.startsAtLocal,
      endsAtLocal: "",
      timezone: "Europe/Brussels",
      locationType: "PHYSICAL",
      locationName: ev.locationName,
      addressLine1: ev.addressLine1 ?? "",
      postalCode: ev.postalCode ?? "",
      city: ev.city,
      country: ev.country || "BE",
      onlineUrl: "",
    } as never,
    { name: "Entrée", price: ev.price, quantity: ev.quantity },
  );
  return { organization: created, event };
}
