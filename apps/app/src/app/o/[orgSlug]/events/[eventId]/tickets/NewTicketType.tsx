"use client";

import type { FeeTerms } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TicketTypeForm } from "./TicketTypeEditor";

export function NewTicketType({
  orgSlug,
  eventId,
  terms,
}: {
  orgSlug: string;
  eventId: string;
  terms: FeeTerms;
}) {
  const t = useTranslations("tickets");
  const [open, setOpen] = useState(false);
  // nouveau tarif : dans une fenêtre
  return (
    <>
      <Button
        type="button"
        variant="dark"
        size="md"
        onClick={() => setOpen(true)}
        className="justify-self-start"
      >
        + {t("addTicketType")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("newTicketType")}
        size="lg"
      >
        <TicketTypeForm
          orgSlug={orgSlug}
          eventId={eventId}
          row={null}
          terms={terms}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
