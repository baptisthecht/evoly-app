"use server";

import { CoreError } from "@evoly/core";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/session";
import { disableTwoFactor, enableTwoFactor, regenerateRecoveryCodes } from "@/server/twoFactor";

type State = { error?: string; codes?: string[]; done?: boolean } | null;
const code = (f: FormData) => String(f.get("code") ?? "").slice(0, 20);

export async function enableAction(_: State, form: FormData): Promise<State> {
  const s = await requireUser();
  try {
    const codes = await enableTwoFactor({ id: s.user.id, email: s.user.email }, s.session.id, code(form));
    return codes ? { codes } : { error: "wrong" };
  } catch (err) {
    if (err instanceof CoreError && err.code === "RATE_LIMITED") return { error: "tooMany" };
    throw err;
  }
}

export async function regenerateAction(_: State, form: FormData): Promise<State> {
  const s = await requireUser();
  try {
    return { codes: await regenerateRecoveryCodes({ id: s.user.id, email: s.user.email }, code(form)) };
  } catch (err) {
    if (err instanceof CoreError) return { error: err.code === "RATE_LIMITED" ? "tooMany" : "wrong" };
    throw err;
  }
}

export async function disableAction(_: State, form: FormData): Promise<State> {
  const s = await requireUser();
  try {
    await disableTwoFactor({ id: s.user.id, email: s.user.email }, code(form));
  } catch (err) {
    if (err instanceof CoreError)
      return { error: err.code === "TWO_FACTOR_REQUIRED_FOR_STAFF" ? "staffRequired" : err.code === "RATE_LIMITED" ? "tooMany" : "wrong" };
    throw err;
  }
  revalidatePath("/compte/securite");
  return { done: true };
}
