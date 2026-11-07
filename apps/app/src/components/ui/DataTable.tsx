"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { cn } from "./cn";
import { SearchField } from "./Controls";

/**
 * Tableau Evoly, inspiré du tableau de beUI : tri, sélection et actions groupées, en-tête qui
 * reste en haut, chiffres alignés, lignes fantômes au chargement, état vide avec son bouton.
 * Sobre (refonte A3, docs/INTERFACE.md) : la ligne sélectionnée prend le fond rose pâle et le trait rose, un
 * rectangle découpé par le tableau ; aucune animation d'entrée. Sur téléphone, chaque ligne
 * devient une carte (titre, sous-titre, pastilles, détails).
 */
export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  /** Contenu de la cellule ; par défaut, la valeur row[key]. */
  cell?: (row: T) => ReactNode;
  /** Valeur de tri ; par défaut, la valeur row[key]. */
  sortValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  /** Largeur, par exemple « 8rem » ; sinon la colonne partage l'espace restant. */
  width?: string;
  /**
   * Place sur téléphone : titre, sous-titre, pastille, détail (par défaut), ou masquée ; en lignes (« mobileLines »), aussi
   * la fin de la ligne du titre (« titleEnd ») et de celle du détail (« metaEnd »).
   */
  mobile?:
    "title" | "titleEnd" | "subtitle" | "badge" | "meta" | "metaEnd" | "hidden";
  /** Classes de la cellule (taille du texte, couleur, pas de retour à la ligne), comme une colonne de la maquette. */
  className?: string;
}
export type TableSort = { key: string; dir: "asc" | "desc" } | null;

const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;
const INTERACTIVE = "a,button,input,label,select,textarea,[role=menuitem]";

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  rowHref,
  onRowClick,
  caption,
  selectable = false,
  selected,
  onSelectedChange,
  bulkActions,
  toolbar,
  search,
  emptyState,
  loading = false,
  defaultSort = null,
  footer,
  selectedLabel,
  mobileLines = false,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  getRowId: (row: T, index: number) => string;
  /** Lien de la ligne : toute la ligne (ou la carte) mène à la fiche. */
  rowHref?: (row: T) => string | null | undefined;
  /** Clic sur la ligne (ouvre une fenêtre) ; la colonne titre devient un bouton pour le clavier. */
  onRowClick?: (row: T) => void;
  /** Titre du tableau pour les lecteurs d'écran. */
  caption: string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Actions sur la sélection, dans la barre qui remplace la barre d'outils. */
  bulkActions?: (ids: string[]) => ReactNode;
  /** Filtres et boutons, à droite de la recherche. */
  toolbar?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  emptyState?: { title: string; description?: string; action?: ReactNode };
  loading?: boolean;
  defaultSort?: TableSort;
  /** Sous le tableau : pagination, total… */
  footer?: ReactNode;
  /** Texte de la barre de sélection (« 1 commande sélectionnée ») ; sinon « 1 sélectionné ». */
  selectedLabel?: (count: number) => string;
  /** Sur téléphone, des lignes séparées par des filets (« .ocard ») : trois lignes, deux colonnes, sans case à cocher. */
  mobileLines?: boolean;
}) {
  const t = useTranslations("table");
  const router = useSafeRouter();
  const [sort, setSort] = useState<TableSort>(defaultSort);
  const [ownSelection, setOwnSelection] = useState<string[]>([]);
  const chosen = selected ?? ownSelection;
  const choose = (ids: string[]) => {
    if (!selected) setOwnSelection(ids);
    onSelectedChange?.(ids);
  };

  const read = (row: T, col: TableColumn<T>) =>
    col.sortValue
      ? col.sortValue(row)
      : ((row as Record<string, unknown>)[col.key] as
          string | number | null | undefined);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const x = read(a, col);
      const y = read(b, col);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return sort.dir === "asc" ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, columns]);
  const toggleSort = (key: string) =>
    setSort((s) =>
      !s || s.key !== key
        ? { key, dir: "asc" }
        : s.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  const ids = sorted.map((r, i) => getRowId(r, i));
  const allChosen = ids.length > 0 && ids.every((id) => chosen.includes(id));
  const someChosen = ids.some((id) => chosen.includes(id));
  const toggleAll = () =>
    choose(
      allChosen
        ? chosen.filter((id) => !ids.includes(id))
        : [...new Set([...chosen, ...ids])],
    );
  const toggle = (id: string) =>
    choose(
      chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id],
    );
  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0]!;
  const open = (e: MouseEvent, row: T, href: string | null | undefined) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    if (onRowClick) return onRowClick(row);
    if (!href) return;
    if (router) router.push(href);
    else window.location.assign(href);
  };
  const value = (row: T, col: TableColumn<T>) =>
    col.cell
      ? col.cell(row)
      : ((row as Record<string, ReactNode>)[col.key] ?? null);

  // refonte A3 (maquettes UIUX/) : la barre d'outils (recherche, filtres), puis, s'il y a une sélection, la barre charbon
  // des actions groupées (« 1 commande sélectionnée », les verbes exacts, « Désélectionner »)
  const tools =
    search || toolbar ? (
      <div className="flex flex-wrap items-center gap-2">
        {search ? (
          <SearchField
            label={search.placeholder ?? t("search")}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? t("search")}
            className="w-full sm:w-[300px]"
          />
        ) : null}
        {toolbar}
      </div>
    ) : null;
  const bar =
    selectable && chosen.length > 0 ? (
      <div
        role="region"
        aria-label={t("selection")}
        className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[var(--btn-primary-bg)] py-1.5 pr-1.5 pl-3.5 text-[13.5px] text-[var(--btn-primary-ink)]"
      >
        <span className="flex-1 tabular-nums">
          {selectedLabel?.(chosen.length) ??
            t("selected", { count: chosen.length })}
        </span>
        {bulkActions?.(chosen)}
        <button
          type="button"
          onClick={() => choose([])}
          className="h-[30px] rounded-[8px] border border-transparent px-[13px] leading-[normal] font-medium hover:bg-white/10"
        >
          {t("clearSelection")}
        </button>
      </div>
    ) : null;

  const empty = !loading && sorted.length === 0;
  const emptyBlock = (
    <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
      <p className="text-[15px] font-semibold">
        {emptyState?.title ?? t("empty")}
      </p>
      {emptyState?.description ? (
        <p className="max-w-md text-[13px] text-ink-muted">
          {emptyState.description}
        </p>
      ) : null}
      {emptyState?.action ? (
        <div className="pt-2">{emptyState.action}</div>
      ) : null}
    </div>
  );

  // une seule construction : sur ordinateur un tableau ; sur téléphone (maquette « Sur téléphone »), chaque ligne devient
  // une rangée séparée par un filet (titre, sous-titre, pastilles, détails avec leur intitulé) ; les rôles explicites
  // gardent la structure partout ; sur téléphone seulement (max-md) : sur ordinateur, la cellule garde le texte du tableau
  const MOBILE = {
    title: "order-1 basis-full max-md:text-[14px] max-md:font-semibold",
    titleEnd: "order-1",
    subtitle: "order-2 basis-full max-md:text-[13px] max-md:text-ink-muted",
    badge: "order-3",
    meta: "order-4 basis-[calc(50%-0.375rem)] max-md:text-[12.5px] max-md:before:block max-md:before:text-ink-muted max-md:before:content-[attr(data-label)]",
    metaEnd: "order-4",
    hidden: "max-md:hidden",
  } as const;
  // en lignes (maquette « Sur téléphone », « .ocard ») : le nom et le montant, puis le détail et la pastille, puis la
  // référence et la date, en 13 px gris ; les autres colonnes restent sur ordinateur
  const LINES = {
    title: "max-md:col-start-1 max-md:row-start-1 max-md:font-semibold",
    titleEnd: "max-md:col-start-2 max-md:row-start-1 max-md:text-right",
    subtitle:
      "max-md:col-start-1 max-md:row-start-2 max-md:text-[13px] max-md:text-ink-muted",
    badge: "max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end",
    meta: "max-md:col-start-1 max-md:row-start-3 max-md:text-[13px] max-md:text-ink-muted",
    metaEnd:
      "max-md:col-start-2 max-md:row-start-3 max-md:text-right max-md:text-[13px] max-md:text-ink-muted",
    hidden: "max-md:hidden",
  } as const;
  const cellClass = (c: TableColumn<T>) =>
    cn(
      mobileLines
        ? LINES[c === titleCol ? "title" : (c.mobile ?? "hidden")]
        : MOBILE[c === titleCol ? "title" : (c.mobile ?? "meta")],
      "min-w-0 md:table-cell md:basis-auto md:border-b md:border-line md:p-2.5 md:align-middle md:tabular-nums",
      ALIGN[c.align ?? "left"],
      c.align === "right" && "tabular-nums",
      c.className,
    );
  return (
    <div className="grid gap-3.5">
      {tools}
      {bar}
      <div className="md:overflow-x-auto">
        <table
          role="table"
          aria-label={caption}
          className="block w-full border-collapse text-ink md:table"
        >
          <colgroup>
            {selectable ? <col style={{ width: "34px" }} /> : null}
            {columns.map((c) => (
              <col
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
              />
            ))}
          </colgroup>
          <thead
            role="rowgroup"
            className="sr-only md:not-sr-only md:sticky md:top-0 md:z-[1] md:table-header-group md:bg-surface-raised"
          >
            <tr role="row">
              {selectable ? (
                <th
                  role="columnheader"
                  scope="col"
                  className="border-b border-line py-[7px] pr-0 pl-2.5 text-left text-[12.5px] leading-[normal]"
                >
                  <input
                    type="checkbox"
                    aria-label={t("selectAll")}
                    checked={allChosen}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChosen && someChosen;
                    }}
                    onChange={toggleAll}
                    className="size-4 cursor-pointer"
                  />
                </th>
              ) : null}
              {columns.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    role="columnheader"
                    scope="col"
                    aria-sort={
                      on
                        ? sort!.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "border-b border-line px-2.5 py-[7px] text-[12.5px] leading-[normal] font-medium whitespace-nowrap text-ink-muted",
                      ALIGN[c.align ?? "left"],
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "group/sort relative transition-colors hover:text-ink",
                          on && "text-ink",
                        )}
                      >
                        {c.header}
                        {/* refonte A3 : la flèche du tri n'apparaît qu'au survol ou une fois le tri choisi, posée à côté
                            du titre sans prendre de place (les colonnes gardent la largeur de la maquette) */}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className={cn(
                            "absolute top-1/2 -mt-[7px] size-3.5 transition-transform duration-200",
                            c.align === "right" ? "-left-4" : "-right-4",
                            on
                              ? "opacity-100"
                              : "opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60",
                            on && sort!.dir === "desc" && "rotate-180",
                          )}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 15 6-6 6 6" />
                        </svg>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody role="rowgroup" className="grid md:table-row-group">
            {loading && sorted.length === 0
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr
                    key={`fantome-${i}`}
                    role="row"
                    aria-hidden="true"
                    className="block h-20 rounded-[var(--r-panel)] bg-surface-sunken md:table-row md:h-[41px] md:rounded-none md:bg-transparent"
                  >
                    {selectable ? (
                      <td
                        role="cell"
                        className="hidden border-b border-line md:table-cell"
                      />
                    ) : null}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        role="cell"
                        className="hidden border-b border-line p-2.5 md:table-cell"
                      >
                        <span
                          className={cn(
                            "block h-3 animate-pulse rounded-full bg-surface-sunken motion-reduce:animate-none",
                            c.align === "right" ? "ml-auto w-12" : "w-2/3",
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {empty ? (
              <tr
                role="row"
                className="block border-y border-line md:table-row md:border-0"
              >
                <td
                  role="cell"
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="block md:table-cell md:border-b md:border-line"
                >
                  {emptyBlock}
                </td>
              </tr>
            ) : null}
            {sorted.map((row, i) => {
              const id = ids[i]!;
              const href = rowHref?.(row);
              const on = chosen.includes(id);
              return (
                <tr
                  key={id}
                  role="row"
                  data-selected={on || undefined}
                  onClick={(e) => open(e, row, href)}
                  className={cn(
                    mobileLines
                      ? "group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line py-3 data-[selected]:bg-highlight-soft"
                      : "group relative flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-line py-3 data-[selected]:bg-highlight-soft",
                    "md:table-row md:border-0 md:bg-transparent md:p-0 md:transition-colors md:hover:bg-surface-hover md:data-[selected]:bg-highlight-soft",
                    (href || onRowClick) && "cursor-pointer",
                  )}
                >
                  {selectable ? (
                    <td
                      role="cell"
                      className={cn(
                        "relative order-0 md:table-cell md:border-b md:border-line md:py-2.5 md:pr-0 md:pl-2.5 md:align-middle",
                        mobileLines && "max-md:hidden",
                      )}
                    >
                      <Rail />
                      <input
                        type="checkbox"
                        aria-label={t("selectRow", { row: i + 1 })}
                        checked={on}
                        onChange={() => toggle(id)}
                        className="size-5 cursor-pointer md:size-4"
                      />
                    </td>
                  ) : null}
                  {columns.map((c, n) => (
                    <td
                      key={c.key}
                      role="cell"
                      data-label={
                        typeof c.header === "string" ? c.header : undefined
                      }
                      className={cn("relative", cellClass(c))}
                    >
                      {!selectable && n === 0 ? <Rail /> : null}
                      {onRowClick && c.key === titleCol.key ? (
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          className="text-left text-ink underline-offset-4 hover:underline"
                        >
                          {value(row, c)}
                        </button>
                      ) : href && c.key === titleCol.key ? (
                        <Link
                          href={href}
                          className="text-ink underline-offset-4 hover:underline"
                        >
                          {value(row, c)}
                        </Link>
                      ) : (
                        value(row, c)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

/** Le trait rose de la ligne sélectionnée (maquettes UIUX/) : un rectangle de 4 px, droit, contre le bord gauche. */
function Rail() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 left-0 hidden w-[var(--row-bar)] bg-highlight opacity-0 group-data-[selected]:opacity-100 md:block"
    />
  );
}

/** Le routeur de Next.js, s'il y en a un (hors de l'application, comme dans un test isolé : navigation classique). */
function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}
