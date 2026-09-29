import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { listNotifications, markRead } from "@/server/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

/** Section 9.20 : liste paginée, lien vers l'élément concerné, « tout marquer comme lu ». */
export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { orgSlug } = await params;
  const page = Math.max(0, Number((await searchParams).page ?? 0) || 0);
  const ctx = await requireOrgContext(orgSlug);
  const { rows, pages } = await listNotifications(ctx.organization.id, ctx.user.id, page);
  const t = await getTranslations("notifications");
  const locale = (await getLocale()) as Locale;
  async function open(id: string, link: string | null) {
    "use server";
    const c = await requireOrgContext(orgSlug);
    await markRead(c.organization.id, c.user.id, id);
    // la mise en page (et donc le compteur de la cloche) est conservée par la navigation : on la rafraîchit
    revalidatePath(`/o/${orgSlug}`, "layout");
    redirect(`/o/${orgSlug}${link && link.startsWith("/") ? link : "/notifications"}`);
  }
  async function readAll() {
    "use server";
    const c = await requireOrgContext(orgSlug);
    await markRead(c.organization.id, c.user.id);
    revalidatePath(`/o/${orgSlug}`, "layout");
  }
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("title")}</h1>
        {rows.some((n) => !n.readAt) ? (
          <form action={readAll}>
            <button type="submit" className={buttonClass("secondary", "md")}>
              {t("markAll")}
            </button>
          </form>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {rows.map((n) => (
            <li key={n.id}>
              <form action={open.bind(null, n.id, n.link)}>
                <button type="submit" className="block w-full rounded-lg text-left">
                  <Card className={`grid gap-1 transition-shadow hover:shadow-md ${n.readAt ? "" : "ring-2 ring-rose"}`}>
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold">
                        {!n.readAt ? <span className="size-2.5 rounded-full bg-rose" aria-label={t("unread")} /> : null}
                        {n.title}
                      </span>
                      <span className="text-xs text-ink-muted">{t(`type_${n.type}`)} · {formatDateTime(n.createdAt, ctx.organization.timezone, locale, "short")}</span>
                    </p>
                    <p className="text-sm text-ink-muted">{n.body}</p>
                  </Card>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav className="flex justify-between" aria-label={t("pagination")}>
          {page > 0 ? <a href={`?page=${page - 1}`} className={buttonClass("secondary", "md")}>{t("previous")}</a> : <span />}
          {page < pages - 1 ? <a href={`?page=${page + 1}`} className={buttonClass("secondary", "md")}>{t("next")}</a> : null}
        </nav>
      ) : null}
    </div>
  );
}
