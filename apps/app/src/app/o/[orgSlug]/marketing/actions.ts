"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { importContacts } from "@/server/contactsImport";
import { runOrgAction, type ActionState } from "@/server/guard";

type ImportResult = { created: number; updated: number; unsubscribed: number; invalid: number };

/** Import de contacts (P1) : réservé à Pro, consentement certifié par l'organisateur. */
export async function importContactsAction(orgSlug: string, text: string, consent: boolean): Promise<ActionState<ImportResult>> {
  const r = await runOrgAction(
    orgSlug,
    { text, consent },
    { schema: z.object({ text: z.string().max(2_000_000), consent: z.boolean() }), permission: "MARKETING_MANAGE", feature: "EMAIL_MARKETING" },
    (d, ctx) => importContacts(ctx, d.text, d.consent),
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/marketing`);
  return r;
}
