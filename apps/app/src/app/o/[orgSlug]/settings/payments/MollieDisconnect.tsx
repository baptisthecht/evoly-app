"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError, useActionForm } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import type { ActionState } from "@/server/guard";
import { disconnectMollieAction } from "../actions";

/** Paramètres, Paiements : déconnecter le compte Mollie, après confirmation (plus de vente payante ensuite). */
export function MollieDisconnect({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("mollie");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(
    async (prev: ActionState) => {
      const r = await disconnectMollieAction(orgSlug, prev);
      if (r?.ok) setOpen(false);
      return r;
    },
    null,
  );
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {t("disconnect")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("disconnectTitle")}
      >
        <form id="mollie-disconnect" {...formProps} className="grid gap-3">
          <FormError state={state} />
          <p className="text-ink-body">{t("disconnectBody")}</p>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              form="mollie-disconnect"
              variant="danger"
              disabled={pending}
            >
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
