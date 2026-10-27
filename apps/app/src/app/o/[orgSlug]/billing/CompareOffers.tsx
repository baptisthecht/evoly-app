"use client";

import { type ReactNode, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Abonnement, offre : la comparaison Free et Pro dans une fenêtre, pour ne pas encombrer la page. */
export function CompareOffers({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass("secondary", "md", "justify-self-start")}
      >
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="lg"
      >
        {children}
      </Dialog>
    </>
  );
}
