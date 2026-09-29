"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { closeParticipantSession, participantEmail, requestParticipantLink, setMarketingPreference } from "@/server/participant";
import { clientIp } from "@/server/requestInfo";

/** Même réponse que l'adresse ait des billets ou non. */
export async function requestLinkAction(_: boolean, form: FormData): Promise<boolean> {
  await requestParticipantLink(String(form.get("email") ?? "").slice(0, 200), await clientIp(), (await getLocale()) === "en" ? "en" : "fr");
  return true;
}

export async function preferenceAction(organizationId: string, consent: boolean) {
  const email = await participantEmail();
  if (!email) return;
  await setMarketingPreference(email, organizationId, consent);
  revalidatePath("/mon-espace");
}

export async function logoutAction() {
  await closeParticipantSession();
  revalidatePath("/mon-espace");
}
