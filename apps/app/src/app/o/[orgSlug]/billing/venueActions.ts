"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runOrgAction, type ActionState } from "@/server/guard";
import { activateVenueProgram, payVenueNow, setVenueThreshold } from "@/server/venues";

const path = (orgSlug: string) => `/o/${orgSlug}/billing`;

/** RG-LIEU-01 : le lieu active le programme « Lieu partenaire ». */
export async function activateVenueAction(orgSlug: string, _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "BILLING_MANAGE" }, async (_d, ctx) => {
    await activateVenueProgram(ctx);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

/** RG-LIEU-06 : seuil de versement réglé par le lieu. */
export async function venueThresholdAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    { enabled: form.get("enabled") === "on", amount: String(form.get("amount") ?? "") },
    { schema: z.object({ enabled: z.boolean(), amount: z.string().max(12) }), permission: "BILLING_MANAGE" },
    async (d, ctx) => {
      await setVenueThreshold(ctx, d);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}

/** RG-LIEU-06 : « Verser maintenant ». */
export async function venuePayNowAction(orgSlug: string, _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "BILLING_MANAGE" }, async (_d, ctx) => {
    await payVenueNow(ctx);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug));
  return r;
}
