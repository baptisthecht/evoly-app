import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo, OMark } from "@/components/Brand";
import { LocaleSwitch } from "@/components/LocaleSwitch";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("brand");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-charbon p-12 text-creme lg:flex lg:flex-col lg:justify-between">
        <Logo className="h-12 w-auto text-creme" />
        <OMark className="pointer-events-none absolute -right-24 -bottom-28 size-[34rem] text-graphite" />
        <p className="relative font-display text-[clamp(3rem,5vw,4.6rem)] leading-[0.92] tracking-[-0.055em]">
          {t("sloganStart")}
          <br />
          {t("sloganMiddle")} <span className="script text-rose">{t("sloganScript")}</span>.
        </p>
      </aside>
      <main className="flex flex-col px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-10 sm:px-10">
        <div className="flex items-center justify-between py-2">
          <Logo className="h-9 w-auto text-ink lg:invisible" />
          <LocaleSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center py-8">{children}</div>
      </main>
    </div>
  );
}
