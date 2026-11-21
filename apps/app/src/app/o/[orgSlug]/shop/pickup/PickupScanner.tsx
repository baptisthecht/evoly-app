"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import {
  pickupConfirmAction,
  pickupLookupAction,
  type PickupLookup,
} from "../actions";

/**
 * Retrait des commandes de la boutique (RG-SHOP-09) : le code QR de la commande scanné à la caméra, ou son code saisi ;
 * la commande s'affiche (articles, état), puis « Remettre la commande » la marque retirée, une seule fois.
 */
export function PickupScanner({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("shopOrders");
  const te = useTranslations("formErrors");
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<PickupLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const explain = (error: string) =>
    error === "NOT_FOUND"
      ? t("pickupNotFound")
      : te.has(error)
        ? te(error)
        : te("generic");
  const lookup = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    const res = await pickupLookupAction(orgSlug, value);
    setBusy(false);
    if (!res?.ok) {
      setOrder(null);
      return setMessage({ ok: false, text: explain(res?.error ?? "generic") });
    }
    setOrder(res.data);
  };
  const confirm = async () => {
    if (!order) return;
    setBusy(true);
    const res = await pickupConfirmAction(orgSlug, order.id);
    setBusy(false);
    if (!res?.ok)
      return setMessage({ ok: false, text: explain(res?.error ?? "generic") });
    setMessage({
      ok: true,
      text: t("pickupDone", { reference: order.reference }),
    });
    setOrder(null);
    setCode("");
  };
  const done = order?.fulfillmentStatus === "PICKED_UP";
  const refunded = order?.status === "REFUNDED";
  return (
    <div className="grid max-w-xl gap-5 py-5">
      <CameraScanner paused={!!order || busy} onCode={(c) => void lookup(c)} />
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(code);
        }}
      >
        <Field label={t("pickupCode")} htmlFor="pickup-code">
          <Input
            id="pickup-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={20}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={busy}>
          {t("pickupFind")}
        </Button>
      </form>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-[10px] px-3.5 py-3 text-[14px] ${message.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
        >
          {message.text}
        </p>
      ) : null}
      {order ? (
        <section
          aria-labelledby="pickup-order"
          className="grid gap-3 rounded-[var(--r-card)] border border-line bg-surface-raised p-4"
        >
          <h2 id="pickup-order" className="text-[15px] font-semibold">
            {order.buyer} · {order.reference}
          </h2>
          <ul className="grid gap-1 text-[14px]">
            {order.lines.map((l, i) => (
              <li key={i}>
                {l.quantity - l.refunded} × {l.name}
              </li>
            ))}
          </ul>
          {order.withdrawal ? (
            <p className="text-[13px] text-danger">{t("withdrawalBadge")}</p>
          ) : null}
          {done ? (
            <p className="text-[14px] font-semibold text-warning">
              {t("alreadyPickedUp")}
            </p>
          ) : refunded ? (
            <p className="text-[14px] font-semibold text-warning">
              {t("payment_REFUNDED")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirm} disabled={busy}>
                {t("handOver")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOrder(null)}
              >
                {t("pickupCancel")}
              </Button>
            </div>
          )}
          <Link
            href={`/o/${orgSlug}/shop/orders/${order.id}`}
            className="text-[13px] underline underline-offset-[3px]"
          >
            {t("openOrder")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
