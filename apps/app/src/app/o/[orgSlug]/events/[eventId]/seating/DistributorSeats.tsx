"use client";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import type { SeatingEditorState } from "@/server/seatingEditor";
import { seatingDistributorAction } from "../../actions";

// Places du plan confiées à un réseau de billetterie (docs/COMPATIBILITE_RESEAUX.md) : retirées de la vente en ligne
type Seat = SeatingEditorState["seats"][number];
type Outcome =
  { ok: boolean; error?: string; data?: unknown } | null | undefined;
type Run = (fn: () => Promise<Outcome>, after?: (r: Outcome) => void) => void;
interface Network {
  id: string;
  name: string;
}
const changedCount = (r: Outcome) =>
  (r?.data as { changed?: number } | undefined)?.changed ?? 0;

/** Une place : vendue par Evoly (en ligne) ou par un réseau ; une place vendue ne change plus de réseau. */
export function DistributorSeatPanel(props: {
  orgSlug: string;
  eventId: string;
  seat: Seat;
  networks: Network[];
  pending: boolean;
  run: Run;
}) {
  const t = useTranslations("seatingEditor");
  const id = useId();
  const [note, setNote] = useState<string | null>(null);
  const { seat } = props;
  const taken = seat.status === "SOLD" || seat.status === "HELD";
  const current = seat.distributorId ?? "";
  const change = (next: string) =>
    props.run(
      async () => {
        if (current) {
          const r = await seatingDistributorAction(
            props.orgSlug,
            props.eventId,
            { distributorId: current, seatIds: [seat.id], assign: false },
          );
          if (!r?.ok || !next) return r;
        }
        return next
          ? seatingDistributorAction(props.orgSlug, props.eventId, {
              distributorId: next,
              seatIds: [seat.id],
              assign: true,
            })
          : null;
      },
      (r) =>
        setNote(next && changedCount(r) === 0 ? t("networkNoneChanged") : null),
    );
  return (
    <Card className="grid gap-3">
      <h3 className="font-semibold">{t("networkTitle")}</h3>
      <Field
        label={t("soldBy")}
        htmlFor={id}
        hint={taken ? t("networkSeatTaken") : t("networkHint")}
      >
        <Select
          id={id}
          value={current}
          disabled={taken || props.pending}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">{t("soldByEvoly")}</option>
          {props.networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
      </Field>
      {note ? (
        <p role="status" className="text-sm text-ink-muted">
          {note}
        </p>
      ) : null}
    </Card>
  );
}

/** Un bloc : ses places libres confiées à un réseau, ou les places de ce réseau rendues à la vente en ligne. */
export function DistributorBlockPanel(props: {
  orgSlug: string;
  eventId: string;
  blockId: string;
  seats: Seat[];
  networks: Network[];
  pending: boolean;
  run: Run;
}) {
  const t = useTranslations("seatingEditor");
  const id = useId();
  const [chosen, setChosen] = useState(props.networks[0]?.id ?? "");
  const [note, setNote] = useState<string | null>(null);
  const inBlock = props.seats.filter((s) => s.blockId === props.blockId);
  const free = inBlock.filter((s) => s.status === "AVAILABLE");
  const ofNetwork = inBlock.filter((s) => s.distributorId === chosen);
  const send = (seatIds: string[], assign: boolean) =>
    props.run(
      () =>
        seatingDistributorAction(props.orgSlug, props.eventId, {
          distributorId: chosen,
          seatIds,
          assign,
        }),
      (r) =>
        setNote(
          changedCount(r) === 0
            ? t("networkNoneChanged")
            : t(assign ? "networkAssigned" : "networkReleased", {
                count: changedCount(r),
              }),
        ),
    );
  return (
    <Card className="grid gap-3">
      <h3 className="font-semibold">{t("networkTitle")}</h3>
      <Field label={t("networkChoose")} htmlFor={id} hint={t("networkHint")}>
        <Select
          id={id}
          value={chosen}
          disabled={props.pending}
          onChange={(e) => setChosen(e.target.value)}
        >
          {props.networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={props.pending || !chosen || free.length === 0}
          onClick={() =>
            send(
              free.map((s) => s.id),
              true,
            )
          }
        >
          {t("networkAssignFree", { count: free.length })}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={props.pending || !chosen || ofNetwork.length === 0}
          onClick={() =>
            send(
              ofNetwork.map((s) => s.id),
              false,
            )
          }
        >
          {t("networkRelease", { count: ofNetwork.length })}
        </Button>
      </div>
      {note ? (
        <p role="status" className="text-sm text-ink-muted">
          {note}
        </p>
      ) : null}
    </Card>
  );
}
