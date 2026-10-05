import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { socialSignInAction } from "./actions";

/** US-AUTH-02 : boutons Google et Apple, affichés seulement si leurs identifiants sont configurés. */
export async function SocialButtons({ next }: { next?: string | null }) {
  const e = env();
  const providers = [
    ...(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET ? (["google"] as const) : []),
    ...(e.AUTH_APPLE_ID && e.AUTH_APPLE_SECRET ? (["apple"] as const) : []),
  ];
  if (providers.length === 0) return null;
  const t = await getTranslations("auth");
  return (
    <div className="grid gap-3">
      {providers.map((p) => (
        <form key={p} action={socialSignInAction.bind(null, p, next ?? null)}>
          <button
            type="submit"
            className={`h-12 w-full rounded-full font-semibold ${p === "apple" ? "bg-noir text-blanc" : "bg-blanc text-charbon shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}
          >
            {t(p === "google" ? "continueWithGoogle" : "continueWithApple")}
          </button>
        </form>
      ))}
      <p className="text-center text-sm text-ink-muted" aria-hidden="true">
        {t("or")}
      </p>
    </div>
  );
}
