import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SocialButtons } from "../SocialButtons";
import { redirectIfSignedIn } from "../redirectIfSignedIn";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; verified?: string; next?: string }> }) {
  const next = typeof (await searchParams).next === "string" ? ((await searchParams).next as string) : null;
  await redirectIfSignedIn();
  const t = await getTranslations("auth");
  const { reset } = await searchParams;
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="page-title">{t("loginTitle")}</h1>
        <p className="text-ink-muted">{t("loginIntro")}</p>
      </header>
      {reset ? (
        <p role="status" className="rounded-md bg-success-soft px-4 py-3 text-sm text-success">
          {t("resetDone")}
        </p>
      ) : null}
      <SocialButtons next={next} />
      <LoginForm />
    </div>
  );
}
