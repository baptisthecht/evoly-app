import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SocialButtons } from "../SocialButtons";
import { redirectIfSignedIn } from "../redirectIfSignedIn";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("registerTitle") };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string; email?: string; next?: string }> }) {
  const next = typeof (await searchParams).next === "string" ? ((await searchParams).next as string) : null;
  await redirectIfSignedIn();
  const t = await getTranslations("auth");
  const { plan, email } = await searchParams;
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="page-title">{t("registerTitle")}</h1>
        <p className="text-ink-muted">{plan === "pro" ? t("registerIntroPro") : t("registerIntro")}</p>
      </header>
      <SocialButtons next={next} />
      <RegisterForm email={email?.slice(0, 200)} />
    </div>
  );
}
