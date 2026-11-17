"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { SavedNote, SettingsRow, SwitchRow } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Field";
import { fulfillmentAction, refundShopOrderAction } from "../../actions";

/**
 * Préparation d'une commande de la boutique (RG-SHOP-09) : « Prête à retirer » (l'acheteur reçoit un e-mail), puis
 * « Marquer retirée » à la remise en main propre (ou par le scan du code QR).
 */
export function FulfillmentButtons({
  orgSlug,
  orderId,
  status,
  canManage,
}: {
  orgSlug: string;
  orderId: string;
  status: string;
  canManage: boolean;
}) {
  const t = useTranslations("shopOrders");
  // action de formulaire directe : le bouton cliqué (l'étape) fait partie de l'envoi
  const [state, action, pending] = useActionState(
    fulfillmentAction.bind(null, orgSlug, orderId),
    null,
  );
  if (!canManage || status === "PICKED_UP" || status === "SHIPPED") return null;
  return (
    <form action={action} className="grid gap-3">
      <FormError state={state} />
      <div className="flex flex-wrap gap-2">
        {status === "TO_PREPARE" ? (
          <Button type="submit" name="step" value="READY" disabled={pending}>
            {t("markReady")}
          </Button>
        ) : null}
        <Button
          type="submit"
          name="step"
          value="PICKED_UP"
          variant={status === "TO_PREPARE" ? "secondary" : "primary"}
          disabled={pending}
        >
          {t("markPickedUp")}
        </Button>
      </div>
    </form>
  );
}

export interface RefundLine {
  id: string;
  name: string;
  /** quantité encore remboursable */
  left: number;
  unitPriceMinor: number;
  /** « 25 € » */
  unitPrice: string;
}

/**
 * Remboursement (RG-SHOP-12) : quantité à rembourser de chaque ligne, articles remis en stock ou non, montant affiché
 * avant l'envoi ; sur le moyen de paiement de l'acheteur.
 */
export function RefundForm({
  orgSlug,
  orderId,
  lines,
  currency,
  locale,
  withdrawal,
}: {
  orgSlug: string;
  orderId: string;
  lines: RefundLine[];
  currency: string;
  locale: string;
  withdrawal: boolean;
}) {
  const t = useTranslations("shopOrders");
  const [qty, setQty] = useState<Record<string, number>>(() =>
    // rétractation : tout ce qui reste est proposé
    Object.fromEntries(lines.map((l) => [l.id, withdrawal ? l.left : 0])),
  );
  const [state, action, pending] = useActionState(
    refundShopOrderAction.bind(null, orgSlug, orderId),
    null,
  );
  const amount = lines.reduce(
    (n, l) => n + l.unitPriceMinor * (qty[l.id] ?? 0),
    0,
  );
  const money = new Intl.NumberFormat(locale, { style: "currency", currency });
  if (!lines.some((l) => l.left > 0)) return null;
  return (
    <SettingsRow title={t("refundTitle")} description={t("refundHint")}>
      <form
        action={action}
        className="grid gap-4"
        onSubmit={(e) =>
          amount > 0 &&
          window.confirm(
            t("refundConfirm", { amount: money.format(amount / 100) }),
          )
            ? undefined
            : e.preventDefault()
        }
      >
        <FormError state={state} />
        <ul className="grid gap-2">
          {lines
            .filter((l) => l.left > 0)
            .map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">
                    {l.name}
                  </span>
                  <small className="text-[12.5px] text-ink-muted">
                    {t("refundLeft", { count: l.left, price: l.unitPrice })}
                  </small>
                </span>
                <Input
                  name={`qty.${l.id}`}
                  inputMode="numeric"
                  aria-label={t("refundQuantity", { name: l.name })}
                  className="w-20 text-right"
                  value={String(qty[l.id] ?? 0)}
                  onChange={(e) => {
                    const n = Math.max(
                      0,
                      Math.min(l.left, Math.floor(Number(e.target.value) || 0)),
                    );
                    setQty((q) => ({ ...q, [l.id]: n }));
                  }}
                />
              </li>
            ))}
        </ul>
        <SwitchRow
          name="restock"
          defaultChecked
          label={t("restock")}
          hint={t("restockHint")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="danger"
            disabled={pending || amount <= 0}
          >
            {t("refundSubmit", { amount: money.format(amount / 100) })}
          </Button>
          {state?.ok ? (
            <SavedNote id="refund-status">{t("refundDone")}</SavedNote>
          ) : null}
        </div>
      </form>
    </SettingsRow>
  );
}
