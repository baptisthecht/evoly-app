import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Brand";
import { buttonClass } from "@/components/ui/Button";
import { acceptInvitation, invitationPreview } from "@/server/team";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** RG-ORG-02 : page dédiée d'acceptation d'une invitation. */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, session] = await Promise.all([invitationPreview(token), getSession()]);
  const t = await getTranslations("invitation");
  async function accept() {
    "use server";
    const s = await getSession();
    if (!s?.user) redirect(`/login?next=${encodeURIComponent(`/invitations/${token}`)}`);
    const slug = await acceptInvitation(s.user.id, token);
    redirect(`/o/${slug}`);
  }
  const email = preview?.email ?? "";
  const matches = !!session?.user && session.user.email.toLowerCase() === email;
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-5 py-10">
      <div className="grid w-full max-w-md gap-5 rounded-[var(--r-panel)] bg-surface-raised p-6 shadow-md ring-1 ring-line">
        <Logo className="h-8 w-auto" />
        {!preview ? (
          <p>{t("notFound")}</p>
        ) : preview.usable !== "OK" ? (
          <>
            <h1 className="font-display text-2xl tracking-[-0.03em]">{t(`state_${preview.usable}`)}</h1>
            <p className="text-ink-muted">{t("askAgain", { organization: preview.organization.name })}</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl tracking-[-0.03em]">{t("title", { organization: preview.organization.name })}</h1>
            <p>{t("body", { inviter: preview.invitedBy.name, role: preview.role.name })}</p>
            {matches ? (
              <form action={accept}>
                <button type="submit" className={buttonClass("primary", "lg", "w-full")}>
                  {t("accept")}
                </button>
              </form>
            ) : session?.user ? (
              <p className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">{t("wrongAccount", { email, current: session.user.email })}</p>
            ) : (
              <div className="grid gap-2">
                <Link href={`/register?email=${encodeURIComponent(email)}`} className={buttonClass("primary", "lg", "w-full")}>
                  {t("register")}
                </Link>
                <Link href={`/login?next=${encodeURIComponent(`/invitations/${token}`)}`} className={buttonClass("secondary", "lg", "w-full")}>
                  {t("login")}
                </Link>
                <p className="text-xs text-ink-muted">{t("sameEmail", { email })}</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
