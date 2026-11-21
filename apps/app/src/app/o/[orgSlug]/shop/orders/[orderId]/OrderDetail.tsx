"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { SavedNote, SettingsRow, SwitchRow } from "@/components/ui/Controls";
import { Field, Input } from "@/components/ui/Field";
import {
  fulfillmentAction,
  refundShopOrderAction,
  shipOrderAction,
} from "../../actions";

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

/**
 * Expédition d'une commande livrée (RG-SHOP-15) : transporteur, numéro et lien de suivi ; l'acheteur reçoit un e-mail
 * avec le lien de suivi. Une seule fois.
 */
export function ShipForm({
  orgSlug,
  orderId,
}: {
  orgSlug: string;
  orderId: string;
}) {
  const t = useTranslations("shopOrders");
  const [state, action, pending] = useActionState(
    shipOrderAction.bind(null, orgSlug, orderId),
    null,
  );
  return (
    <form action={action} className="grid gap-3">
      <FormError state={state} />
      <p className="text-[13px] text-ink-muted">{t("shipIntro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("carrier")} htmlFor="ship-carrier">
          <Input
            id="ship-carrier"
            name="carrier"
            maxLength={60}
            placeholder={t("carrierPlaceholder")}
            required
          />
        </Field>
        <Field label={t("trackingNumber")} htmlFor="ship-number">
          <Input
            id="ship-number"
            name="trackingNumber"
            maxLength={80}
            required
          />
        </Field>
      </div>
      <Field
        label={t("trackingUrl")}
        htmlFor="ship-url"
        hint={t("trackingUrlHint")}
      >
        <Input
          id="ship-url"
          name="trackingUrl"
          type="url"
          inputMode="url"
          maxLength={500}
          required
        />
      </Field>
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {t("shipSubmit")}
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
  shipping = null,
}: {
  orgSlug: string;
  orderId: string;
  lines: RefundLine[];
  currency: string;
  locale: string;
  withdrawal: boolean;
  /** livraison encore remboursable (une seule fois) : son montant */
  shipping?: { amountMinor: number } | null;
}) {
  const t = useTranslations("shopOrders");
  const [qty, setQty] = useState<Record<string, number>>(() =>
    // rétractation : tout ce qui reste est proposé
    Object.fromEntries(lines.map((l) => [l.id, withdrawal ? l.left : 0])),
  );
  const [refundShipping, setRefundShipping] = useState(withdrawal);
  const [state, action, pending] = useActionState(
    refundShopOrderAction.bind(null, orgSlug, orderId),
    null,
  );
  const amount =
    lines.reduce((n, l) => n + l.unitPriceMinor * (qty[l.id] ?? 0), 0) +
    (shipping && refundShipping ? shipping.amountMinor : 0);
  const money = new Intl.NumberFormat(locale, { style: "currency", currency });
  if (!lines.some((l) => l.left > 0) && !shipping) return null;
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
        {shipping ? (
          <SwitchRow
            name="shipping"
            checked={refundShipping}
            onChange={(e) => setRefundShipping(e.target.checked)}
            label={t("refundShipping", {
              amount: money.format(shipping.amountMinor / 100),
            })}
          />
        ) : null}
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
