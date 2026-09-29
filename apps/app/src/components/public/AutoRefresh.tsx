"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** RG-BUY-08 : la page interroge l'état de la commande tant que le paiement n'est pas confirmé. */
export function AutoRefresh({ everyMs = 2000, maxTimes = 45 }: { everyMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= maxTimes) clearInterval(id);
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxTimes]);
  return null;
}
