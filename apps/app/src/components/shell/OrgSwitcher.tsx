import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";

/** Sélecteur d'organisation (US-ORG-04) : liste les organisations dont l'utilisateur est membre actif. */
export async function OrgSwitcher({ userId, currentSlug, currentName }: { userId: string; currentSlug: string; currentName: string }) {
  const t = await getTranslations("nav");
  const memberships = await db.organizationMember.findMany({
    where: { userId, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
    select: { organization: { select: { slug: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const others = memberships.map((m) => m.organization).filter((o) => o.slug !== currentSlug);
  return (
    <details className="group rounded-lg open:bg-surface-sunken">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2.5 py-2 hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-label text-[0.68rem] font-bold text-ink-muted">{t("organization")}</span>
          <span className="block truncate font-semibold">{currentName}</span>
        </span>
        <span aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="grid gap-1 px-2 pb-2">
        {others.map((o) => (
          <li key={o.slug}>
            <Link href={`/o/${o.slug}`} className="block truncate rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-raised">
              {o.name}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/onboarding" className="block rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-raised">
            + {t("newOrganization")}
          </Link>
        </li>
      </ul>
    </details>
  );
}
