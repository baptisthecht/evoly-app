"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { cancelListingAction } from "../../actions";

export function CancelListing({ orgSlug, eventId, listingId }: { orgSlug: string; eventId: string; listingId: string }) {
  const t = useTranslations("resaleAdmin");
  const [state, action, pending] = useActionState(cancelListingAction.bind(null, orgSlug, eventId, listingId), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("confirmCancel"))) e.preventDefault();
      }}
    >
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {t("cancelListing")}
      </Button>
      <FormError state={state} />
    </form>
  );
}
