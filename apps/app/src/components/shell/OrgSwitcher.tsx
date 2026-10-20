import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";

/** Sélecteur d'organisation (US-ORG-04) : liste les organisations dont l'utilisateur est membre actif. */
export async function OrgSwitcher({
  userId,
  currentSlug,
  currentName,
  plan,
}: {
  userId: string;
  currentSlug: string;
  currentName: string;
  plan?: { text: string; offered: boolean };
}) {
  const t = await getTranslations("nav");
  const memberships = await db.organizationMember.findMany({
    where: { userId, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
    select: { organization: { select: { slug: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const others = memberships.map((m) => m.organization).filter((o) => o.slug !== currentSlug);
  return (
    <details className="group rounded-md">
      <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 py-2 ring-1 ring-line hover:bg-surface group-open:bg-surface [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-accent text-[0.8125rem] font-semibold text-[var(--required)]"
        >
          {currentName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]!.toUpperCase())
            .join("")}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="sr-only">{t("organization")}</span>
          <span className="truncate text-[0.8125rem] font-medium">{currentName}</span>
          {plan ? (
            <span className={plan.offered ? "truncate text-[0.6875rem] text-success" : "truncate text-[0.6875rem] text-ink-muted"}>{plan.text}</span>
          ) : null}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 10l5 5 5-5" />
        </svg>
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
