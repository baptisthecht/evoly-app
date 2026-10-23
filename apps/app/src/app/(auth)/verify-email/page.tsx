import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckIcon } from "@/components/ui/icons";
import { formatStartWhen, readStartNotice } from "@/server/startNotice";
import { ResendForm } from "./ResendForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("verifyTitle") };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; resent?: string; error?: string }>;
}) {
  const t = await getTranslations("auth");
  const { email = "", resent, error } = await searchParams;
  // venu de la création rapide : l'événement créé, rappelé (même adresse seulement)
  const notice = email ? await readStartNotice(email) : null;
  const when = notice
    ? formatStartWhen(notice.startsAtLocal, await getLocale())
    : "";
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="page-title">{t("verifyTitle")}</h1>
        <p className="text-ink-muted">
          {email ? t("verifyBody", { email }) : t("verifyBodyNoEmail")}
        </p>
        {resent ? (
          <p className="text-sm text-ink-muted">{t("verifyNotYet")}</p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {t("verifyLinkInvalid")}
          </p>
        ) : null}
      </header>
      {notice ? (
        <section
          aria-label={t("startSavedTitle")}
          className="grid gap-1.5 rounded-lg bg-surface-raised p-4 ring-1 ring-line"
        >
          <p className="flex items-center gap-2 font-medium">
            <CheckIcon className="shrink-0 text-success" strokeWidth={2.6} />
            {t("startSavedTitle")}
          </p>
          <p className="text-sm">
            <strong>{notice.title}</strong>
            {when ? ` · ${when}` : ""}
            {notice.place ? ` · ${notice.place}` : ""}
          </p>
          <p className="text-sm text-ink-muted">{t("startSavedNext")}</p>
        </section>
      ) : null}
      {email ? <ResendForm email={email} /> : null}
      <Link
        href="/login"
        className="text-center text-sm font-semibold underline underline-offset-4"
      >
        {t("backToLogin")}
      </Link>
    </div>
  );
}
