"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/server/guard";
import { requireStaff } from "@/server/platform";
import { parsePromotionForm } from "@/server/promotionForm";
import { savePromotion, setPromotionActive } from "@/server/promotions";

/** Création ou modification d'une offre (administrateurs d'Evoly). */
export async function savePromotionAction(
  id: string | null,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const st = await requireStaff("ADMIN");
  const parsed = parsePromotionForm(form);
  if (!parsed.ok)
    return { ok: false, error: "INVALID_INPUT", fields: parsed.fields };
  try {
    await savePromotion(st.user.id, parsed.data, id ?? undefined);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return {
        ok: false,
        error: "INVALID_INPUT",
        fields: { code: "validation.codeTaken" },
      };
    throw e;
  }
  redirect("/admin/offres");
}

export async function togglePromotionAction(id: string, active: boolean) {
  const st = await requireStaff("ADMIN");
  await setPromotionActive(st.user.id, id, active);
}
