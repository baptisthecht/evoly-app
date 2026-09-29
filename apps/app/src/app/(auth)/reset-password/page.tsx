import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ResetForm } from "./ResetForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("resetTitle") };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const t = await getTranslations("auth");
  const { token, error } = await searchParams;
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="page-title">{t("resetTitle")}</h1>
      </header>
      {token && !error ? (
        <ResetForm token={token} />
      ) : (
        <div className="grid gap-5">
          <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
            {t("resetLinkInvalid")}
          </p>
          <Link href="/forgot-password" className="text-center text-sm font-semibold underline underline-offset-4">
            {t("sendResetLink")}
          </Link>
        </div>
      )}
    </div>
  );
}
