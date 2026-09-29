"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/forms";
import { eventCommandAction } from "../actions";

type Command = "publish" | "pause" | "resume" | "duplicate" | "delete";

export function EventCommand({ orgSlug, eventId, command, variant = "dark", confirm }: { orgSlug: string; eventId: string; command: Command; variant?: "primary" | "dark" | "secondary" | "ghost" | "danger"; confirm?: string }) {
  const t = useTranslations("events");
  const [state, action] = useActionState(eventCommandAction.bind(null, orgSlug, eventId, command), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="grid gap-2"
    >
      <SubmitButton pending={undefined} variant={variant} className={command === "delete" ? "w-full text-danger sm:w-auto lg:w-full" : "w-full sm:w-auto lg:w-full"}>
        {t(`command_${command}`)}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
