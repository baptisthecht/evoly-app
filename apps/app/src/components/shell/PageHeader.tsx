import type { ReactNode } from "react";
import { SectionTabs, type SectionTab } from "./SectionTabs";

/** Bande blanche en haut de chaque page (maquette validée) : titre, onglets éventuels, un ou deux boutons à droite. */
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
  return (
    <div className="border-b border-line bg-surface-raised px-4 sm:px-8 lg:px-10">
      <div className={`mx-auto grid max-w-[var(--content-max)] gap-3.5 pt-[1.125rem] ${tabs?.length ? "" : "pb-[1.125rem]"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            {eyebrow}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="page-title min-w-0 break-words">{title}</h1>
              {badge}
            </div>
            {meta}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {tabs?.length ? <SectionTabs tabs={tabs} label={tabsLabel} /> : null}
      </div>
    </div>
  );
}
