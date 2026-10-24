import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Lien vers l'autre page (inscription ou connexion), sous les boutons Google et
 * Apple : hors du formulaire, pour que ces boutons suivent « Se connecter ».
 */
export async function AuthSwitch({ to }: { to: "login" | "register" }) {
  const t = await getTranslations("auth");
  return (
    // 20 px sous le bloc précédent, comme dans le formulaire (espacement de la page : 32 px)
    <p className="-mt-3 text-center text-sm text-ink-muted">
      {t(to === "register" ? "noAccount" : "haveAccount")}{" "}
      <Link
        href={to === "register" ? "/register" : "/login"}
        className="font-semibold text-ink underline underline-offset-4"
      >
        {t(to === "register" ? "register" : "login")}
      </Link>
    </p>
  );
}
