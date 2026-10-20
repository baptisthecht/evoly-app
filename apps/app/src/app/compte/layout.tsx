import type { ReactNode } from "react";
import { ThemePro } from "@/components/theme/ThemePro";

/** Thème pro de l'application des organisateurs. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ThemePro />
      {children}
    </>
  );
}
