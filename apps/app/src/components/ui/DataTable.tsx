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
  const router = useRouter();
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
    router.push(href);
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

  return (
    <div className="grid gap-3">
      {bar}
      {/* ordinateur : le tableau */}
      <div className="hidden overflow-x-auto rounded-[var(--r-panel)] bg-surface-raised ring-1 ring-line md:block">
        <table className="w-full border-collapse text-sm">
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
          <thead className="sticky top-0 z-[1] bg-surface-raised">
            <tr className="h-11">
              {selectable ? (
                <th scope="col" className="pl-5">
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
          <tbody>
            {loading && sorted.length === 0
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr
                    key={`fantome-${i}`}
                    aria-hidden="true"
                    className="h-14 border-t border-line"
                  >
                    {selectable ? <td /> : null}
                    {columns.map((c) => (
                      <td key={c.key} className="px-4">
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
              <tr className="border-t border-line">
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
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
                  data-selected={on || undefined}
                  onClick={(e) => open(e, href)}
                  style={enter(i)}
                  className={cn(
                    "group h-14 border-t border-line transition-colors hover:bg-surface-sunken/60 data-[selected]:bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]",
                    href && "cursor-pointer",
                  )}
                >
                  {selectable ? (
                    <td className="relative pl-5">
                      <Rail />
                      <input
                        type="checkbox"
                        aria-label={t("selectRow", { row: i + 1 })}
                        checked={on}
                        onChange={() => toggle(id)}
                        className="size-4 cursor-pointer accent-[var(--evoly-charbon)]"
                      />
                    </td>
                  ) : null}
                  {columns.map((c, n) => (
                    <td
                      key={c.key}
                      className={cn(
                        "relative px-4 py-2",
                        ALIGN[c.align ?? "left"],
                        c.align === "right" && "tabular-nums",
                      )}
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
      {/* téléphone : des cartes */}
      <ul role="list" aria-label={caption} className="grid gap-2 md:hidden">
        {loading && sorted.length === 0
          ? Array.from({ length: 3 }, (_, i) => (
              <li
                key={`fantome-${i}`}
                aria-hidden="true"
                className="h-20 animate-pulse rounded-[var(--r-panel)] bg-surface-sunken motion-reduce:animate-none"
              />
            ))
          : null}
        {empty ? (
          <li className="rounded-[var(--r-panel)] bg-surface-raised ring-1 ring-line">
            {emptyBlock}
          </li>
        ) : null}
        {sorted.map((row, i) => {
          const id = ids[i]!;
          const href = rowHref?.(row);
          const on = chosen.includes(id);
          const sub = columns.filter((c) => c.mobile === "subtitle");
          const badges = columns.filter((c) => c.mobile === "badge");
          const meta = columns.filter(
            (c) => c !== titleCol && (c.mobile ?? "meta") === "meta",
          );
          const body = (
            <>
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="truncate font-semibold">
                  {value(row, titleCol)}
                </span>
                {sub.map((c) => (
                  <span key={c.key} className="truncate text-sm text-ink-muted">
                    {value(row, c)}
                  </span>
                ))}
                {badges.length ? (
                  <span className="flex flex-wrap gap-1.5 pt-0.5">
                    {badges.map((c) => (
                      <span key={c.key}>{value(row, c)}</span>
                    ))}
                  </span>
                ) : null}
                {meta.length ? (
                  <span className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-xs">
                    {meta.map((c) => (
                      <span key={c.key} className="min-w-0">
                        <span className="block text-ink-muted">{c.header}</span>
                        <span className="block truncate tabular-nums">
                          {value(row, c)}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              {href ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4 shrink-0 self-center text-ink-subtle"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              ) : null}
            </>
          );
          return (
            <li
              key={id}
              data-selected={on || undefined}
              style={enter(i)}
              className="relative flex items-start gap-3 rounded-[var(--r-panel)] bg-surface-raised p-4 ring-1 ring-line data-[selected]:ring-2 data-[selected]:ring-[var(--accent)]"
            >
              {selectable ? (
                <input
                  type="checkbox"
                  aria-label={t("selectRow", { row: i + 1 })}
                  checked={on}
                  onChange={() => toggle(id)}
                  className="mt-1 size-5 shrink-0 accent-[var(--evoly-charbon)]"
                />
              ) : null}
              {href ? (
                <Link
                  href={href}
                  className="flex min-w-0 flex-1 items-start gap-3"
                >
                  {body}
                </Link>
              ) : (
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {footer}
    </div>
  );
}

/** Le liseré rose de la ligne survolée ou sélectionnée. */
function Rail() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-2 left-0 w-[3px] origin-center scale-y-0 rounded-full bg-[var(--accent)] transition-transform duration-200 group-hover:scale-y-100 group-data-[selected]:scale-y-100 motion-reduce:transition-none"
    />
  );
}
