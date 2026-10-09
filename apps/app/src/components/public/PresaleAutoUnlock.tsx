"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { unlockPresaleAction } from "@/app/site/[sub]/[eventSlug]/actions";

/** Lien « ?prevente=CODE » : le code est vérifié et mémorisé, puis la page se recharge sans le code dans l'adresse. */
export function PresaleAutoUnlock({ eventId, code, labels }: { eventId: string; code: string; labels: { working: string; invalid: string; back: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void unlockPresaleAction(eventId, code).then((r) => (r.ok ? router.replace(pathname) : setFailed(true)));
  }, [eventId, code, pathname, router]);
  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-6 text-center text-ink">
      <div className="grid justify-items-center gap-3">
        <p role="status">{failed ? labels.invalid : labels.working}</p>
        {failed ? (
          <a href={pathname} className="underline underline-offset-4">
            {labels.back}
          </a>
        ) : null}
      </div>
    </div>
  );
}
