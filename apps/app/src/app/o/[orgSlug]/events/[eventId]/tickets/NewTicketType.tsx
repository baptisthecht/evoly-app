"use client";

import type { FeeTerms } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TicketTypeForm } from "./TicketTypeEditor";
import { PlusIcon } from "@/components/ui/icons";

export function NewTicketType({
  orgSlug,
  eventId,
  terms,
  eventDay,
}: {
  orgSlug: string;
  eventId: string;
  terms: FeeTerms;
  eventDay?: string;
}) {
  const t = useTranslations("tickets");
  const [open, setOpen] = useState(false);
  // nouveau tarif : dans une fenêtre
  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("newTicketType")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("newTicketType")}
      >
        <TicketTypeForm
          orgSlug={orgSlug}
          eventId={eventId}
          row={null}
          terms={terms}
          eventDay={eventDay}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
