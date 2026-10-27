"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "./cn";

/**
 * Tableau Evoly, inspiré du tableau de beUI : tri, sélection et actions groupées, en-tête qui
 * reste en haut, chiffres alignés, lignes fantômes au chargement, état vide avec son bouton.
 * Sobre, avec un seul geste marquant : un liseré rose sur la ligne survolée ou sélectionnée.
 * Les lignes apparaissent en fondu au premier affichage seulement. Sur téléphone, chaque ligne
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
  /** Place dans la carte du téléphone : titre, sous-titre, pastille, détail (par défaut), ou masquée. */
  mobile?: "title" | "subtitle" | "badge" | "meta" | "hidden";
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
}: {
  rows: T[];
  columns: TableColumn<T>[];
  getRowId: (row: T, index: number) => string;
  /** Lien de la ligne : toute la ligne (ou la carte) mène à la fiche. */
  rowHref?: (row: T) => string | null | undefined;
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
  // un seul fondu, celui du premier affichage : les lignes ajoutées ensuite apparaissent sans effet
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setIntro(false), 900);
    return () => window.clearTimeout(id);
  }, []);

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
  const open = (e: MouseEvent, href: string | null | undefined) => {
    if (!href || (e.target as HTMLElement).closest(INTERACTIVE)) return;
    if (router) router.push(href);
    else window.location.assign(href);
  };
  const enter = (i: number) =>
    intro
      ? {
          animation: `evoly-row-in 320ms var(--motion-ease-out) ${Math.min(i, 10) * 28}ms both`,
        }
      : undefined;
  const value = (row: T, col: TableColumn<T>) =>
    col.cell
      ? col.cell(row)
      : ((row as Record<string, ReactNode>)[col.key] ?? null);

  const bar =
    selectable && chosen.length > 0 ? (
      <div
        role="region"
        aria-label={t("selection")}
        className="flex min-h-12 flex-wrap items-center gap-3 rounded-full bg-surface-inverse py-1.5 pr-2 pl-5 text-sm text-ink-inverse"
      >
        <span className="font-semibold tabular-nums">
          {t("selected", { count: chosen.length })}
        </span>
        <span className="flex flex-1 flex-wrap items-center gap-2">
          {bulkActions?.(chosen)}
        </span>
        <button
          type="button"
          onClick={() => choose([])}
          className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
        >
          {t("clearSelection")}
        </button>
      </div>
    ) : search || toolbar ? (
      <div className="flex flex-wrap items-center gap-2">
        {search ? (
          <label className="relative flex min-w-[min(100%,16rem)] flex-1 items-center">
            <span className="sr-only">{search.placeholder ?? t("search")}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3.5 size-4 text-ink-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? t("search")}
              className="h-11 w-full rounded-full bg-surface-raised pr-4 pl-10 text-sm ring-1 ring-line outline-none placeholder:text-ink-subtle focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
          </label>
        ) : null}
        {toolbar ? (
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        ) : null}
      </div>
    ) : null;

  const empty = !loading && sorted.length === 0;
  const emptyBlock = (
    <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
      <p className="font-display text-lg">{emptyState?.title ?? t("empty")}</p>
      {emptyState?.description ? (
        <p className="max-w-md text-sm text-ink-muted">
          {emptyState.description}
        </p>
      ) : null}
      {emptyState?.action ? (
        <div className="pt-2">{emptyState.action}</div>
      ) : null}
    </div>
  );

  // une seule construction : sur ordinateur un tableau ; sur téléphone, les styles font de chaque ligne une carte
  // (titre, sous-titre, pastilles, détails avec leur intitulé) ; les rôles explicites gardent la structure partout
  const MOBILE = {
    title: "order-1 basis-full text-[0.95rem] font-semibold",
    subtitle: "order-2 basis-full text-sm text-ink-muted",
    badge: "order-3",
    meta: "order-4 basis-[calc(50%-0.375rem)] text-xs before:block before:text-ink-muted before:content-[attr(data-label)]",
    hidden: "hidden",
  } as const;
  const cellClass = (c: TableColumn<T>) =>
    cn(
      MOBILE[c === titleCol ? "title" : (c.mobile ?? "meta")],
      "min-w-0 md:table-cell md:basis-auto md:px-4 md:py-2 md:align-middle md:text-sm md:font-normal md:text-ink md:before:content-none",
      ALIGN[c.align ?? "left"],
      c.align === "right" && "tabular-nums",
      c === titleCol && "md:font-normal",
    );
  return (
    <div className="grid gap-3">
      {bar}
      <div className="md:overflow-x-auto md:rounded-[var(--r-panel)] md:bg-surface-raised md:ring-1 md:ring-line">
        <table
          role="table"
          aria-label={caption}
          className="block w-full border-collapse text-sm md:table"
        >
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            {selectable ? <col style={{ width: "3.25rem" }} /> : null}
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
            <tr role="row" className="md:h-11">
              {selectable ? (
                <th role="columnheader" scope="col" className="md:pl-5">
                  <input
                    type="checkbox"
                    aria-label={t("selectAll")}
                    checked={allChosen}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChosen && someChosen;
                    }}
                    onChange={toggleAll}
                    className="size-4 cursor-pointer accent-[var(--evoly-charbon)]"
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
                      "px-4 font-[family-name:var(--label-family)] text-xs font-semibold text-ink-muted",
                      ALIGN[c.align ?? "left"],
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:text-ink",
                          on && "text-ink",
                        )}
                      >
                        {c.header}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className={cn(
                            "size-3.5 transition-transform duration-200",
                            on ? "opacity-100" : "opacity-35",
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
          <tbody role="rowgroup" className="grid gap-2 md:table-row-group">
            {loading && sorted.length === 0
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr
                    key={`fantome-${i}`}
                    role="row"
                    aria-hidden="true"
                    className="block h-20 rounded-[var(--r-panel)] bg-surface-sunken md:table-row md:h-14 md:rounded-none md:border-t md:border-line md:bg-transparent"
                  >
                    {selectable ? (
                      <td role="cell" className="hidden md:table-cell" />
                    ) : null}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        role="cell"
                        className="hidden px-4 md:table-cell"
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
                className="block rounded-[var(--r-panel)] bg-surface-raised ring-1 ring-line md:table-row md:rounded-none md:border-t md:border-line md:ring-0"
              >
                <td
                  role="cell"
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="block md:table-cell"
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
                  onClick={(e) => open(e, href)}
                  style={enter(i)}
                  className={cn(
                    "group relative flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-[var(--r-panel)] bg-surface-raised p-4 ring-1 ring-line data-[selected]:ring-2 data-[selected]:ring-[var(--accent)]",
                    "md:table-row md:h-14 md:rounded-none md:border-t md:border-line md:bg-transparent md:p-0 md:ring-0 md:transition-colors md:hover:bg-surface-sunken/60 md:data-[selected]:bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] md:data-[selected]:ring-0",
                    href && "cursor-pointer",
                  )}
                >
                  {selectable ? (
                    <td
                      role="cell"
                      className="relative order-0 md:table-cell md:pl-5 md:align-middle"
                    >
                      <Rail />
                      <input
                        type="checkbox"
                        aria-label={t("selectRow", { row: i + 1 })}
                        checked={on}
                        onChange={() => toggle(id)}
                        className="size-5 cursor-pointer accent-[var(--evoly-charbon)] md:size-4"
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
                      {href && c.key === titleCol.key ? (
                        <Link
                          href={href}
                          className="font-semibold text-ink underline-offset-4 hover:underline"
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

/** Le liseré rose de la ligne survolée ou sélectionnée. */
function Rail() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-2 left-0 hidden w-[3px] md:block origin-center scale-y-0 rounded-full bg-[var(--accent)] transition-transform duration-200 group-hover:scale-y-100 group-data-[selected]:scale-y-100 motion-reduce:transition-none"
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
