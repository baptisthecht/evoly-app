"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runOrgAction, type ActionState } from "@/server/guard";
import {
  acceptSelfBilling,
  activateVenueProgram,
  payVenueNow,
  setVenueHall,
  setVenueThreshold,
} from "@/server/venues";

const path = (orgSlug: string) => `/o/${orgSlug}/billing`;

/** RG-LIEU-01 : le lieu active le programme « Lieu partenaire ». */
export async function activateVenueAction(
  orgSlug: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "BILLING_MANAGE" },
    async (_d, ctx) => {
      await activateVenueProgram(ctx);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

/** RG-LIEU-06 : seuil de versement réglé par le lieu. */
export async function venueThresholdAction(
  orgSlug: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {
      enabled: form.get("enabled") === "on",
      amount: String(form.get("amount") ?? ""),
    },
    {
      schema: z.object({ enabled: z.boolean(), amount: z.string().max(12) }),
      permission: "BILLING_MANAGE",
    },
    async (d, ctx) => {
      await setVenueThreshold(ctx, d);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

/** RG-LIEU-06 : « Verser maintenant ». */
export async function venuePayNowAction(
  orgSlug: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "BILLING_MANAGE" },
    async (_d, ctx) => {
      await payVenueNow(ctx);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

/** Section 9.32 : la salle du lieu, proposée aux organisateurs qu'il a parrainés. */
export async function venueHallAction(
  orgSlug: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const f = (k: string) => String(form.get(k) ?? "");
  const r = await runOrgAction(
    orgSlug,
    {
      hallName: f("hallName"),
      addressLine1: f("addressLine1"),
      postalCode: f("postalCode"),
      city: f("city"),
      country: f("country"),
    },
    {
      schema: z.object({
        hallName: z.string().max(120),
        addressLine1: z.string().max(160),
        postalCode: z.string().max(16),
        city: z.string().max(80),
        country: z.string().max(2),
      }),
      permission: "BILLING_MANAGE",
    },
    async (d, ctx) => {
      await setVenueHall(ctx, d);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

/** RG-LIEU-07 : le lieu accepte l'autofacturation de sa part. */
export async function acceptSelfBillingAction(
  orgSlug: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "BILLING_MANAGE" },
    async (_d, ctx) => {
      await acceptSelfBilling(ctx);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}
