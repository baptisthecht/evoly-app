/** Onglets d'un événement (maquette validée le 21 octobre 2026) : les six parties de l'événement, en haut de la page. */

export interface EventTabItem {
  label: string;
  href: string;
}
export interface EventTab {
  key: "overview" | "ticketing" | "attendees" | "sales" | "dayOf" | "settings";
  label: string;
  href: string;
  /** Pages de la partie, affichées dans la seconde rangée (vide : partie d'une seule page). */
  items: EventTabItem[];
}
export interface HiddenFeature {
  key: "seating" | "options" | "ambassadors";
  label: string;
  hint: string;
  href: string;
  /** Partie où la fonctionnalité apparaît une fois ajoutée. */
  tab: EventTab["key"];
}

/**
 * Parties et pages d'un événement. Fonctionnalités à ajouter (plan de salle, options, ambassadeurs) : visibles si
 * l'événement les utilise ; sinon proposées dans « Ajouter une fonctionnalité ». « Mise en ligne » : avec le droit de publier.
 */
export function buildEventTabs(input: {
  t: (key: string) => string;
  base: string;
  used: { seating: boolean; options: boolean; ambassadors: boolean };
  canPublish: boolean;
}) {
  const { t, base } = input;
  const item = (key: string, path: string): EventTabItem => ({
    label: t(key),
    href: `${base}/${path}`,
  });
  const ticketing = [
    item("tickets", "tickets"),
    item("seating", "seating"),
    item("tables", "tables"),
    item("options", "options"),
  ];
  const sales = [
    item("eventPage", "appearance"),
    ...(input.canPublish ? [item("launch", "launch")] : []),
    item("promo", "promo"),
    item("ambassadors", "ambassadors"),
    item("distribution", "distribution"), // réseaux de billetterie et contingents
    item("embed", "embed"),
  ];
  const tabs: EventTab[] = [
    { key: "overview", label: t("eventOverview"), href: base, items: [] },
    {
      key: "ticketing",
      label: t("groupTicketing"),
      href: ticketing[0]!.href,
      items: ticketing,
    },
    {
      key: "attendees",
      label: t("groupAttendees"),
      href: `${base}/orders`,
      items: [
        item("orders", "orders"),
        item("resale", "resale"),
        item("emails", "emails"),
      ],
    },
    {
      key: "sales",
      label: t("groupSales"),
      href: sales[0]!.href,
      items: sales,
    },
    {
      key: "dayOf",
      label: t("groupDayOf"),
      href: `${base}/entries`,
      items: [
        item("entries", "entries"),
        item("cash", "cash"),
        item("labels", "etiquettes"),
        item("offline", "offline"),
      ],
    },
    {
      key: "settings",
      label: t("eventSettings"),
      href: `${base}/settings`,
      items: [],
    },
  ];
  // toutes les fonctionnalités affichées directement (plus de menu « Ajouter une fonctionnalité »)
  const hidden: HiddenFeature[] = [];
  return { tabs, hidden };
}

/** Partie active d'après l'adresse de la page ; une fonctionnalité pas encore ajoutée compte dans sa partie quand on est dessus. */
export function activeEventTab(
  tabs: EventTab[],
  hidden: HiddenFeature[],
  pathname: string,
): EventTab["key"] {
  const path = pathname.replace(/\/$/, "");
  const under = (href: string) => path === href || path.startsWith(`${href}/`);
  for (const tab of tabs)
    if (
      tab.key !== "overview" &&
      (tab.items.length
        ? tab.items.some((i) => under(i.href))
        : under(tab.href))
    )
      return tab.key;
  const feature = hidden.find((h) => under(h.href));
  return feature ? feature.tab : "overview";
}
