import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Brand";
import { db } from "@/lib/db";
import { getSession } from "@/server/session";
import { twoFactorSatisfied } from "@/server/twoFactor";
import { VerifyForm } from "./VerifyForm";
import { safeNext } from "@/lib/safeRedirect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Double authentification", robots: { index: false, follow: false } };

/** US-AUTH-06 : code de l'application d'authentification ou code de secours, après la connexion. */
export default async function TwoFactorVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const target = safeNext(next) ?? "/";
  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { id: true, twoFactorEnabled: true } });
  if (await twoFactorSatisfied(user, session.session.id)) redirect(target);
  const t = await getTranslations("twoFactor");
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-5 py-10">
      <div className="grid w-full max-w-sm gap-5 rounded-[var(--r-panel)] bg-surface-raised p-6 shadow-md ring-1 ring-line">
        <Logo className="h-8 w-auto" />
        <h1 className="font-display text-2xl tracking-[-0.03em]">{t("verifyTitle")}</h1>
        <p className="text-ink-muted">{t("verifyBody")}</p>
        <VerifyForm next={target} />
      </div>
    </main>
  );
}
