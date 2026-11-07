import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { logoutAction } from "@/app/(auth)/actions";
import { LocaleSwitch } from "../LocaleSwitch";
import { InstallAppButton } from "../pwa/InstallAppButton";
import { orgInitials } from "./initials";
import { OrgMenu } from "./OrgMenu";

/** Une entrée du menu : la hauteur et l'arrondi des liens de la barre. */
const item =
  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[13.5px] font-normal text-ink-muted hover:bg-surface-sunken hover:text-ink";
const glyph = (d: ReactNode) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    className="size-4 shrink-0"
  >
    {d}
  </svg>
);

/**
 * Sélecteur d'organisation (US-ORG-04, refonte A3) : la pastille rose aux initiales, le nom et l'offre, sans cadre.
 * Il ouvre les autres organisations dont l'utilisateur est membre actif, puis son compte (avec `account`) : nom,
 * notifications, sécurité, langue, application, déconnexion.
 */
export async function OrgSwitcher({
  userId,
  currentSlug,
  currentName,
  plan,
  logoUrl,
  account,
}: {
  userId: string;
  currentSlug: string;
  currentName: string;
  plan?: { text: string; offered: boolean };
  /** Logo de la marque : à la place des initiales. */
  logoUrl?: string | null;
  /** Le compte, dans le même menu (ordinateur) ; sur téléphone, la feuille « Plus » le montre à part. */
  account?: { name: string; email: string; unread: number };
}) {
  const [t, tn, tf, tp] = await Promise.all([
    getTranslations("nav"),
    getTranslations("notifications"),
    getTranslations("twoFactor"),
    getTranslations("pwa"),
  ]);
  const memberships = await db.organizationMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      organization: { status: "ACTIVE", deletedAt: null },
    },
    select: { organization: { select: { slug: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const others = memberships
    .map((m) => m.organization)
    .filter((o) => o.slug !== currentSlug);
  const unread = account?.unread ?? 0;
  return (
    <OrgMenu
      trigger={
        <>
          <span className="sr-only">{t("organization")}</span>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="size-[26px] shrink-0 rounded-[7px] bg-surface-raised object-contain"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-rose font-figures text-[11px] leading-[normal] font-normal tracking-[-0.02em] text-charbon"
            >
              {orgInitials(currentName)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{currentName}</span>
            {plan ? (
              <small
                className={
                  plan.offered
                    ? "block truncate text-[12px] font-normal text-success"
                    : "block truncate text-[12px] font-normal text-ink-caption"
                }
              >
                {plan.text}
              </small>
            ) : null}
          </span>
          {unread > 0 ? (
            <span
              className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-rose px-1 text-[11px] font-semibold text-charbon tabular-nums"
              data-testid="unread-count"
              aria-label={tn("bell", { count: unread })}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
          >
            <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
          </svg>
        </>
      }
    >
      {others.map((o) => (
        <Link key={o.slug} href={`/o/${o.slug}`} className={item}>
          <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-surface-sunken font-figures text-[9px] leading-none text-ink"
          >
            {orgInitials(o.name)}
          </span>
          <span className="truncate">{o.name}</span>
        </Link>
      ))}
      <Link href="/onboarding" className={item}>
        {glyph(<path d="M12 5v14M5 12h14" />)}
        {t("newOrganization")}
      </Link>
      {account ? (
        <>
          <hr className="my-1 border-line" />
          <div className="min-w-0 px-2 py-1">
            <p className="truncate text-[13.5px] font-semibold text-ink">
              {account.name}
            </p>
            <p className="truncate text-[12px] text-ink-faint">
              {account.email}
            </p>
          </div>
          <Link href={`/o/${currentSlug}/notifications`} className={item}>
            {glyph(
              <>
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </>,
            )}
            <span className="flex-1 truncate">{tn("title")}</span>
            {unread > 0 ? (
              <span className="text-[12px] text-ink tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          <Link href="/compte/securite" className={item}>
            {glyph(
              <>
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </>,
            )}
            <span className="truncate">{tf("accountLink")}</span>
          </Link>
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <LocaleSwitch align="start" />
            <InstallAppButton label={tp("install")} iosHint={tp("iosHint")} />
          </div>
          <form action={logoutAction}>
            <button className={item}>
              {glyph(<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />)}
              {t("logout")}
            </button>
          </form>
        </>
      ) : null}
    </OrgMenu>
  );
}
