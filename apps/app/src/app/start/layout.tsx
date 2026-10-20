import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo } from "@/components/Brand";
import { ThemePro } from "@/components/theme/ThemePro";

/** Création rapide (visiteurs des annonces) : pleine largeur, thème pro. */
export default async function StartLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("quickstart");
  return (
    <div className="min-h-dvh bg-surface">
      <ThemePro />
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-[70rem] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" aria-label="Evoly">
            <Logo className="h-5 w-auto" />
          </Link>
          <p className="text-[0.8125rem] text-ink-muted">
            {t("haveAccount")}{" "}
            <Link href="/login" className="font-medium text-ink">
              {t("login")}
            </Link>
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-[70rem] px-5 pt-8 pb-14 sm:px-8 lg:pt-10">{children}</main>
    </div>
  );
}
