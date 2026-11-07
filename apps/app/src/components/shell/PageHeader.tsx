import type { ReactNode } from "react";
import { cn } from "../ui/cn";
import { SectionTabs, type SectionTab } from "./SectionTabs";

/**
 * Bande en haut de chaque page (refonte A3, maquettes UIUX/) : sans onglets, 56 px de haut, le titre en 16 px demi-gras à
 * gauche et un ou deux boutons à droite ; avec onglets, le titre et les boutons sur une rangée, puis les onglets soulignés.
 */
export function PageHeader({
  title,
  tabs,
  tabsLabel = "",
  actions,
  eyebrow,
  badge,
  meta,
}: {
  title: ReactNode;
  tabs?: SectionTab[];
  tabsLabel?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
}) {
  const withTabs = !!tabs?.length;
  // une fiche (fil d'Ariane au-dessus) : l'en-tête d'un événement (« .ehead ») : le fil en 12,5 px, le titre en 21 px
  const detail = !!eyebrow;
  return (
    // sur téléphone (maquette « Sur téléphone ») : pas de bande, le titre en 28 px et ses boutons, 18 px du bord
    <div
      className={cn(
        "bg-surface-raised px-[18px] sm:px-8 lg:border-b lg:border-line lg:px-7",
        (withTabs || detail) && "border-b border-line",
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-[var(--content-max)]",
          detail
            ? "pt-1 lg:pt-3.5"
            : withTabs
              ? "pt-1.5 lg:pt-4"
              : "flex items-center pt-1.5 lg:min-h-[55px] lg:py-0",
        )}
      >
        <div
          className={cn(
            "flex w-full flex-wrap justify-between gap-x-5 gap-y-2",
            detail ? "items-start" : "items-center",
          )}
        >
          <div className={cn("grid min-w-0", !detail && "gap-0.5")}>
            {eyebrow}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1
                className={cn(
                  "min-w-0 font-semibold break-words",
                  detail
                    ? "mt-2 mb-0.5 text-[22px] leading-[1.2] lg:mt-0.5 lg:mb-[3px] lg:text-[21px] lg:leading-[1.25] lg:tracking-[-0.01em]"
                    : "text-[28px] leading-[normal] tracking-[-0.02em] lg:text-[16px] lg:tracking-normal",
                )}
              >
                {title}
              </h1>
              {badge}
            </div>
            {meta}
          </div>
          {actions ? (
            // sur téléphone, les boutons sans icône (maquette : « Exporter »)
            <div className="flex flex-wrap items-center gap-2 max-lg:[&_svg]:hidden">
              {actions}
            </div>
          ) : null}
        </div>
        {withTabs ? <SectionTabs tabs={tabs!} label={tabsLabel} /> : null}
      </div>
    </div>
  );
}
