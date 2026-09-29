"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/forms";
import { connectStripeAction } from "../actions";

export function ConnectStripe({ orgSlug, label }: { orgSlug: string; label?: string }) {
  const t = useTranslations("onboarding");
  const [state, action] = useActionState(connectStripeAction.bind(null, orgSlug), null);
  return (
    <form action={action} className="grid gap-3">
      <FormError state={state} />
      <SubmitButton variant="primary">{label ?? t("connectStripe")}</SubmitButton>
    </form>
  );
}
