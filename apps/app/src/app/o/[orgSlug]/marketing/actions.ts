"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CoreError } from "@evoly/core";
import { db } from "@/lib/db";
import {
  automationDoc,
  eventMarketingAutomations,
  saveMarketingAutomation,
} from "@/server/automations";
import { importContacts } from "@/server/contactsImport";
import { runOrgAction, type ActionState } from "@/server/guard";

type ImportResult = {
  created: number;
  updated: number;
  unsubscribed: number;
  invalid: number;
};

/** Import de contacts (P1) : réservé à Pro, consentement certifié par l'organisateur. */
export async function importContactsAction(
  orgSlug: string,
  text: string,
  consent: boolean,
): Promise<ActionState<ImportResult>> {
  const r = await runOrgAction(
    orgSlug,
    { text, consent },
    {
      schema: z.object({
        text: z.string().max(2_000_000),
        consent: z.boolean(),
      }),
      permission: "MARKETING_MANAGE",
      feature: "EMAIL_MARKETING",
    },
    (d, ctx) => importContacts(ctx, d.text, d.consent),
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/marketing`);
  return r;
}

/**
 * Bandeau de la page Marketing (refonte A3) : « Activer » met en route l'e-mail « Dernières places » d'un événement, avec
 * son objet et son message actuels (ceux par défaut s'il n'a jamais été réglé).
 */
export async function enableLastTicketsAction(
  orgSlug: string,
  eventId: string,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    {
      schema: z.object({}),
      permission: "MARKETING_MANAGE",
      feature: "EMAIL_MARKETING",
    },
    async (_d, ctx) => {
      const event = await db.event.findFirst({
        where: { id: eventId, organizationId: ctx.organization.id },
        select: { id: true },
      });
      if (!event) throw new CoreError("NOT_FOUND");
      const a = (await eventMarketingAutomations(event.id)).find(
        (x) => x.type === "LAST_TICKETS",
      )!;
      await saveMarketingAutomation(ctx, event.id, "LAST_TICKETS", {
        enabled: true,
        subject: a.subject,
        content: automationDoc(a.content, a.subject),
      });
      return null;
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/marketing`);
  return r;
}
