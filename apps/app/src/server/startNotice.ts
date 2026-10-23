import { cookies } from "next/headers";

/**
 * Événement créé par la création rapide (/start), rappelé sur la page de vérification de l'adresse : enregistré, en
 * attente de publication. Cookie technique (strictement nécessaire), 7 jours ; affiché seulement pour la même adresse.
 */
export const START_NOTICE_COOKIE = "evoly_start";
export interface StartNotice {
  email: string;
  title: string;
  startsAtLocal: string;
  place: string;
}

export function parseStartNotice(
  raw: string | undefined,
  email: string,
): StartNotice | null {
  if (!raw || !email) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<StartNotice>;
    const str = (x: unknown, max: number) =>
      typeof x === "string" && x.length <= max ? x : null;
    const n = {
      email: str(v.email, 254),
      title: str(v.title, 200),
      startsAtLocal: str(v.startsAtLocal, 16) ?? "",
      place: str(v.place, 200) ?? "",
    };
    if (
      !n.email ||
      !n.title ||
      n.email.toLowerCase() !== email.trim().toLowerCase()
    )
      return null;
    if (
      n.startsAtLocal &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n.startsAtLocal)
    )
      n.startsAtLocal = "";
    return n as StartNotice;
  } catch {
    return null;
  }
}

/** Date et heure telles que l'organisateur les a saisies (heure locale de l'événement), dans la langue de la page. */
export function formatStartWhen(startsAtLocal: string, locale: string): string {
  if (!startsAtLocal) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${startsAtLocal}:00Z`));
}

export async function writeStartNotice(n: StartNotice) {
  (await cookies()).set(
    START_NOTICE_COOKIE,
    encodeURIComponent(
      JSON.stringify({
        ...n,
        title: n.title.slice(0, 200),
        place: n.place.slice(0, 200),
      }),
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86_400,
      secure: process.env.NODE_ENV === "production",
    },
  );
}

export async function readStartNotice(
  email: string,
): Promise<StartNotice | null> {
  return parseStartNotice(
    (await cookies()).get(START_NOTICE_COOKIE)?.value,
    email,
  );
}
