import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { OMark } from "@/components/Brand";

export const metadata: Metadata = { title: "Scanner", robots: { index: false, follow: false } };

export default async function ScannerHome() {
  if ((await headers()).get("x-evoly-scanner") !== "1") notFound();
  const t = await getTranslations("scanner");
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--evoly-charbon)] px-6 text-center text-[var(--evoly-creme)]">
      <div className="grid max-w-sm justify-items-center gap-4">
        <OMark className="size-16" />
        <h1 className="font-display text-3xl tracking-[-0.04em]">{t("homeTitle")}</h1>
        <p className="opacity-80">{t("homeBody")}</p>
        {/* US-SCN-06 : un membre de l'équipe se connecte à l'app, puis ouvre le scanner avec son lien personnel */}
        <a
          href={`${env().NEXT_PUBLIC_APP_URL}/acces-scanner`}
          className="mt-2 rounded-full bg-[var(--evoly-rose)] px-6 py-3 font-semibold text-[var(--evoly-charbon)]"
        >
          {t("homeMember")}
        </a>
      </div>
    </main>
  );
}
