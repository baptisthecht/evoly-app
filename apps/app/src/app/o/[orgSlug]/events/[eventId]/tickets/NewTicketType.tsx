"use client";

import type { FeeTerms } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TicketTypeForm } from "./TicketTypeEditor";

export function NewTicketType({ orgSlug, eventId, terms }: { orgSlug: string; eventId: string; terms: FeeTerms }) {
  const t = useTranslations("tickets");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(true)} className="justify-self-start">
        + {t("addTicketType")}
      </Button>
    );
  return (
    <Card className="grid gap-4">
      <h3 className="font-display text-lg tracking-[var(--tracking-title)]">{t("newTicketType")}</h3>
      <TicketTypeForm orgSlug={orgSlug} eventId={eventId} row={null} terms={terms} onDone={() => setOpen(false)} />
    </Card>
  );
}
