"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { unlockEventAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";

/** RG-PUB-06 : saisie du code d'accès d'un événement privé. */
export function AccessGate({ eventId }: { eventId: string }) {
  const t = useTranslations("public");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-16 text-center" aria-labelledby="access-title">
      <h1 id="access-title" className="font-display text-3xl tracking-[-0.04em]">
        {t("privateTitle")}
      </h1>
      <p className="text-ink-muted">{t("privateBody")}</p>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await unlockEventAction(eventId, code);
          setBusy(false);
          if (res.ok) router.refresh();
          else setError(res.error === "RATE_LIMITED" ? t("privateTooMany") : t("privateWrong"));
        }}
      >
        <Input
          aria-label={t("privateCode")}
          placeholder={t("privateCode")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="text-center font-mono text-lg tracking-[0.2em]"
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={busy || code.trim().length < 4}>
          {t("privateSubmit")}
        </Button>
      </form>
    </section>
  );
}
