"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "./Analytics";
import { ConsentBanner } from "./ConsentBanner";

/** Jamais dans la billetterie intégrée chez un organisateur, ni dans le scanner des bénévoles. */
const EXCLUDED = ["/integre", "/scanner", "/acces-scanner"];

export function Tracking() {
  const path = usePathname() ?? "/";
  if (EXCLUDED.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return (
    <>
      <Analytics />
      <ConsentBanner />
    </>
  );
}
