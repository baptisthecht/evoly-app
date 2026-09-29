import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ResendForm } from "./ResendForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("verifyTitle") };
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; resent?: string; error?: string }> }) {
  const t = await getTranslations("auth");
  const { email = "", resent, error } = await searchParams;
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="page-title">{t("verifyTitle")}</h1>
        <p className="text-ink-muted">{email ? t("verifyBody", { email }) : t("verifyBodyNoEmail")}</p>
        {resent ? <p className="text-sm text-ink-muted">{t("verifyNotYet")}</p> : null}
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
            {t("verifyLinkInvalid")}
          </p>
        ) : null}
      </header>
      {email ? <ResendForm email={email} /> : null}
      <Link href="/login" className="text-center text-sm font-semibold underline underline-offset-4">
        {t("backToLogin")}
      </Link>
    </div>
  );
}
