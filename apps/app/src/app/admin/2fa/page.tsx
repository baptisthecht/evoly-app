import { notFound, redirect } from "next/navigation";
import { currentStaff } from "@/server/platform";

export const dynamic = "force-dynamic";

/** Back-office : double authentification obligatoire (enregistrement, puis code à chaque session). */
export default async function StaffTwoFactor() {
  const st = await currentStaff();
  if (!st) notFound();
  if (st.verified) redirect("/admin");
  redirect(st.user.twoFactorEnabled ? "/2fa?next=/admin" : "/compte/securite");
}
