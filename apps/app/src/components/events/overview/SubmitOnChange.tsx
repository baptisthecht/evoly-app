"use client";

import type { SelectHTMLAttributes } from "react";

/** Liste de choix qui envoie son formulaire dès qu'on change de valeur (filtre des dernières commandes). */
export function SubmitOnChange(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    />
  );
}
