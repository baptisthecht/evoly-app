"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** Section 9.9 : lien à partager pour que des amis réservent les places libres les plus proches. */
export function ShareFriendLink({ url, eventTitle }: { url: string; eventTitle: string }) {
  const t = useTranslations("orders");
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="friends-title" className="grid gap-3 rounded-lg bg-surface-sunken p-5">
      <h2 id="friends-title" className="font-display text-lg">
        {t("friendsTitle")}
      </h2>
      <p className="text-sm">{t("friendsBody")}</p>
      <div className="flex flex-wrap gap-2">
        <label htmlFor="friends-url" className="sr-only">
          {t("friendsLink")}
        </label>
        <input
          id="friends-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-blanc px-3 font-mono text-xs"
        />
        <button
          type="button"
          className="min-h-11 rounded-full bg-surface-inverse px-4 text-sm font-semibold text-ink-inverse"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: eventTitle, url });
                return;
              } catch {
                /* partage annulé : copie */
              }
            }
            await navigator.clipboard?.writeText(url);
            setCopied(true);
          }}
        >
          {t("friendsShare")}
        </button>
      </div>
      {copied ? (
        <p role="status" className="text-sm font-semibold">
          {t("friendsCopied")}
        </p>
      ) : null}
    </section>
  );
}
