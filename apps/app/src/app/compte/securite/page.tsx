import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Brand";
import { db } from "@/lib/db";
import { requireUser } from "@/server/session";
import { remainingRecoveryCodes, setupSecret } from "@/server/twoFactor";
import { TwoFactorPanel } from "./SecurityForms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sécurité du compte", robots: { index: false, follow: false } };

/** US-AUTH-06 : activation, codes de secours et désactivation de la double authentification. */
export default async function SecurityPage() {
  const session = await requireUser();
  const t = await getTranslations("twoFactor");
  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { email: true, twoFactorEnabled: true, platformRole: true } });
  const setup = user.twoFactorEnabled ? null : await setupSecret(session.user.id, user.email);
  const qr = setup ? await QRCode.toString(setup.uri, { type: "svg", margin: 1, width: 180 }) : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-5 py-10">
      <div className="grid w-full max-w-md gap-5 rounded-[var(--r-panel)] bg-surface-raised p-6 shadow-md ring-1 ring-line">
        <Logo className="h-8 w-auto" />
        <Link href="/" className="text-sm font-semibold text-ink-muted">← {t("back")}</Link>
        <h1 className="font-display text-2xl tracking-[-0.03em]">{t("title")}</h1>
        <TwoFactorPanel enabled={user.twoFactorEnabled} staff={user.platformRole !== "NONE"} setup={setup && qr ? { qr, secret: setup.secret } : null} status={user.twoFactorEnabled ? t("enabled", { count: await remainingRecoveryCodes(session.user.id) }) : ""} />
      </div>
    </main>
  );
}
