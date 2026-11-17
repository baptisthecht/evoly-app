"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { withdrawShopOrderAction } from "@/app/site/[sub]/boutique/actions";
import { Button } from "@/components/ui/Button";
import { writeCart } from "./cart";

/** Commande payée : le panier du navigateur est vidé (il a servi). */
export function ClearCart({ organizationId }: { organizationId: string }) {
  useEffect(() => writeCart(organizationId, []), [organizationId]);
  return null;
}

/**
 * Droit de rétractation (RG-SHOP-11) : « Je me rétracte », confirmé, depuis la page de la commande ; l'organisation est
 * prévenue et rembourse au retour des produits.
 */
export function WithdrawButton({ token }: { token: string }) {
  const t = useTranslations("shopPublic");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid justify-items-start gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          if (!window.confirm(t("withdrawConfirm"))) return;
          setBusy(true);
          const res = await withdrawShopOrderAction(token);
          setBusy(false);
          if (!res.ok)
            return setMessage(
              t.has(`error_${res.error}`)
                ? t(`error_${res.error}`)
                : t("error_UNKNOWN"),
            );
          router.refresh();
        }}
      >
        {t("withdraw")}
      </Button>
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
