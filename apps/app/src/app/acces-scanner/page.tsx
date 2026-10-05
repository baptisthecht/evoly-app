import { can, effectiveEnd, type Permission, type SystemRole } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/Brand";
import { buttonClass } from "@/components/ui/Button";
import { db } from "@/lib/db";
import { openScannerAction } from "@/app/o/[orgSlug]/events/actions";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Scanner", robots: { index: false, follow: false } };

/** US-SCN-06 : depuis scanner.evoly.me, un membre connecté choisit l'événement à scanner (lien personnel). */
export default async function ScannerAccessPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?next=/acces-scanner");
  const t = await getTranslations("scannerAccess");
  const locale = (await getLocale()) as Locale;
  const now = new Date();
  const members = await db.organizationMember.findMany({
    where: { userId: session.user.id, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
    include: { role: true, organization: { select: { slug: true, name: true, timezone: true } } },
  });
  const allowed = members.filter((m) =>
    can({ status: m.status, systemRole: m.role.systemKey as SystemRole | null, permissions: m.role.permissions as Permission[] }, "CHECKIN_SCAN"),
  );
  const events = await db.event.findMany({
    where: {
      organizationId: { in: allowed.map((m) => m.organizationId) },
      deletedAt: null,
      status: { in: ["PUBLISHED", "SALES_PAUSED", "ENDED"] },
      startsAt: { lt: new Date(now.getTime() + 7 * 86_400_000), gt: new Date(now.getTime() - 3 * 86_400_000) },
    },
    select: { id: true, title: true, startsAt: true, endsAt: true, timezone: true, organizationId: true },
    orderBy: { startsAt: "asc" },
  });
  const current = events.filter((e) => effectiveEnd(e.startsAt, e.endsAt).getTime() + 6 * 3_600_000 > now.getTime());
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--evoly-charbon)] px-5 py-10 text-[var(--evoly-creme)]">
      <div className="grid w-full max-w-md gap-5">
        <Logo className="h-8 w-auto text-[var(--evoly-creme)]" />
        <h1 className="font-display text-3xl tracking-[-0.04em]">{t("title")}</h1>
        {current.length === 0 ? <p className="opacity-80">{t("empty")}</p> : <p className="opacity-80">{t("intro")}</p>}
        <ul className="grid gap-3">
          {current.map((e) => {
            const m = allowed.find((x) => x.organizationId === e.organizationId)!;
            return (
              <li key={e.id} className="grid gap-3 rounded-2xl bg-blanc/10 p-4">
                <div>
                  <p className="text-sm opacity-70">{m.organization.name}</p>
                  <p className="font-semibold">{e.title}</p>
                  <p className="text-sm opacity-80">{formatDateTime(e.startsAt, e.timezone, locale, "short")}</p>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await openScannerAction(m.organization.slug, e.id, null); // redirige vers le scanner avec le lien personnel
                  }}
                >
                  <button type="submit" className={buttonClass("primary", "lg", "w-full")}>
                    {t("open")}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
