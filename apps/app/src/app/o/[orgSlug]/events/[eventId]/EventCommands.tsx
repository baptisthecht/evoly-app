"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/forms";
import { eventCommandAction } from "../actions";

type Command = "publish" | "pause" | "resume" | "duplicate" | "delete";

export function EventCommand({
  orgSlug,
  eventId,
  command,
  variant = "dark",
  confirm,
}: {
  orgSlug: string;
  eventId: string;
  command: Command;
  variant?: "primary" | "dark" | "secondary" | "ghost" | "danger";
  confirm?: string;
}) {
  const t = useTranslations("events");
  const [state, action] = useActionState(
    eventCommandAction.bind(null, orgSlug, eventId, command),
    null,
  );
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      // le bouton à sa taille, aligné à gauche (la grille étirerait ses enfants)
      className="grid justify-items-start gap-2"
    >
      <SubmitButton
        pending={undefined}
        variant={variant}
        className={command === "delete" ? "w-auto text-danger!" : "w-auto"}
      >
        {t(`command_${command}`)}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
