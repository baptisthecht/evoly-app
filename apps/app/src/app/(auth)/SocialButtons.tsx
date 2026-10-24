import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { socialSignInAction } from "./actions";

/** Taille du bouton principal (« Se connecter », « Créer mon compte ») : les deux boutons restent identiques. */
const CONTROL =
  "inline-flex w-full items-center justify-center rounded-[var(--control-radius)] " +
  "h-[var(--control-h-lg)] px-3 text-[length:var(--control-text-lg)] font-medium " +
  "transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * Bouton personnalisé conforme aux consignes de marque de Google : couleurs du
 * thème (--google-*, clair et sombre), 10 px entre le logo et le texte, logo
 * « G » officiel en couleurs (fichier fourni par Google, déposé dans
 * public/brand/google-g.svg ; jamais redessiné ni recoloré).
 */
const GOOGLE =
  "gap-2.5 bg-[var(--google-fill)] text-[var(--google-ink)] " +
  "shadow-[inset_0_0_0_1px_var(--google-stroke)] hover:bg-[var(--google-hover)]";
const APPLE = "gap-2.5 bg-noir text-blanc hover:opacity-90";

/**
 * US-AUTH-02 : boutons Google et Apple, sous le bouton principal comme sur la
 * maquette validée, affichés seulement si leurs identifiants sont configurés.
 */
export async function SocialButtons({ next }: { next?: string | null }) {
  const e = env();
  const providers = [
    ...(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET ? (["google"] as const) : []),
    ...(e.AUTH_APPLE_ID && e.AUTH_APPLE_SECRET ? (["apple"] as const) : []),
  ];
  if (providers.length === 0) return null;
  const t = await getTranslations("auth");
  return (
    // 12 px sous le bouton principal (espacement de la page : 32 px)
    <div className="-mt-5 grid gap-3">
      {providers.map((p) => (
        <form key={p} action={socialSignInAction.bind(null, p, next ?? null)}>
          <button
            type="submit"
            className={`${CONTROL} ${p === "google" ? GOOGLE : APPLE}`}
          >
            {p === "google" ? (
              <span
                aria-hidden="true"
                data-google-logo
                className="size-[18px] shrink-0 bg-[url('/brand/google-g.svg')] bg-contain bg-center bg-no-repeat"
              />
            ) : null}
            {t(p === "google" ? "continueWithGoogle" : "continueWithApple")}
          </button>
        </form>
      ))}
    </div>
  );
}
