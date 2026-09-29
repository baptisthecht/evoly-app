"use server";

import { redirect } from "next/navigation";
import { CoreError } from "@evoly/core";
import { getSession } from "@/server/session";
import { verifyTwoFactor } from "@/server/twoFactor";
import { safeNext } from "@/lib/safeRedirect";

export async function verifyAction(next: string, _: string | null, form: FormData): Promise<string | null> {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  let ok = false;
  try {
    ok = await verifyTwoFactor({ id: session.user.id, email: session.user.email }, session.session.id, String(form.get("code") ?? "").slice(0, 20));
  } catch (err) {
    if (err instanceof CoreError && err.code === "RATE_LIMITED") return "tooMany";
    throw err;
  }
  if (!ok) return "wrong";
  redirect(safeNext(next) ?? "/");
}
