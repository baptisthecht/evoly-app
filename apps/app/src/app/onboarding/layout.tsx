import type { ReactNode } from "react";
import { Logo } from "@/components/Brand";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { requireUser } from "@/server/session";

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-2 sm:px-8">
        <Logo className="h-9 w-auto text-ink" />
        <LocaleSwitch />
      </header>
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-16 sm:px-8">{children}</main>
    </div>
  );
}
