"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateHolderAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";

/** RG-QST-02 : modification du titulaire depuis la page des billets. */
export function HolderEditor({ token, ticketId, firstName, lastName }: { token: string; ticketId: string; firstName: string; lastName: string }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState({ firstName, lastName });
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = `${firstName} ${lastName}`.trim();
  if (!editing)
    return (
      <div className="grid justify-items-center gap-1 text-sm">
        {name ? <p>{name}</p> : null}
        <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setEditing(true)}>
          {name ? t("changeHolder") : t("addHolder")}
        </button>
      </div>
    );
  return (
    <div className="grid w-full gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label={t("holderFirstName")} placeholder={t("holderFirstName")} value={value.firstName} onChange={(e) => setValue((v) => ({ ...v, firstName: e.target.value }))} />
        <Input aria-label={t("holderLastName")} placeholder={t("holderLastName")} value={value.lastName} onChange={(e) => setValue((v) => ({ ...v, lastName: e.target.value }))} />
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{t("holderError")}</p> : null}
      <div className="flex justify-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="dark"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await updateHolderAction(token, ticketId, value);
            setBusy(false);
            if (!res.ok) return setError(true);
            setEditing(false);
            router.refresh();
          }}
        >
          {t("saveHolder")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
