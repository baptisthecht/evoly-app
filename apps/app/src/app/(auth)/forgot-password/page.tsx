import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotForm } from "./ForgotForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("forgotTitle") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="page-title">{t("forgotTitle")}</h1>
        <p className="text-ink-muted">{t("forgotIntro")}</p>
      </header>
      <ForgotForm />
    </div>
  );
}
