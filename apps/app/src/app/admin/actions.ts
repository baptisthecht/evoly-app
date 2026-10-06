"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assignPlan,
  extendTrial,
  reactivateOrganization,
  requireStaff,
  resendOrderEmail,
  retryFailedResale,
  setFeatureFlag,
  startSupportView,
  suspendOrganization,
} from "@/server/platform";

const orgPath = (id: string) => `/admin/organisations/${id}`;
const text = (f: FormData, k: string, max = 300) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);

export async function suspendAction(id: string, form: FormData) {
  const st = await requireStaff("ADMIN");
  const reason = text(form, "reason");
  if (reason.length < 5) return;
  await suspendOrganization(st, id, reason);
  revalidatePath(orgPath(id));
}

export async function reactivateAction(id: string) {
  await reactivateOrganization(await requireStaff("ADMIN"), id);
  revalidatePath(orgPath(id));
}

export async function extendTrialAction(id: string, form: FormData) {
  await extendTrial(await requireStaff("ADMIN"), id, Number(form.get("days")));
  revalidatePath(orgPath(id));
}

export async function assignPlanAction(id: string, form: FormData) {
  const until = text(form, "until", 10);
  await assignPlan(
    await requireStaff("ADMIN"),
    id,
    form.get("plan") === "free" ? "free" : form.get("plan") === "partner" ? "partner" : "pro",
    until ? new Date(`${until}T23:59:59Z`) : null,
  );
  revalidatePath(orgPath(id));
}

export async function resendOrderAction(id: string, form: FormData) {
  await resendOrderEmail(await requireStaff("ADMIN"), text(form, "orderId", 40));
  revalidatePath(orgPath(id));
}

export async function retryResaleAction(id: string, listingId: string) {
  await retryFailedResale(await requireStaff("ADMIN"), listingId);
  revalidatePath(orgPath(id));
}

export async function featureFlagAction(id: string | null, form: FormData) {
  await setFeatureFlag(await requireStaff("ADMIN"), text(form, "key", 60), id, form.get("enabled") === "on");
  revalidatePath(id ? orgPath(id) : "/admin");
}

/** Consultation en lecture seule de l'app de l'organisateur (support et administrateurs). */
export async function supportViewAction(id: string) {
  const slug = await startSupportView(await requireStaff("SUPPORT"), id);
  redirect(`/o/${slug}`);
}
