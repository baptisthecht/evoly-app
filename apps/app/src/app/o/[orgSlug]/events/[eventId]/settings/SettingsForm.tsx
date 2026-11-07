"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";
import {
  EventFields,
  type EventFieldValues,
  type PartnerVenueOption,
} from "@/components/events/EventFields";
import { FormError, useFieldError } from "@/components/forms";
import { BarActions } from "@/components/shell/EventTabs";
import {
  ExampleNote,
  SavedNote,
  SettingsRow,
  SwitchRow,
} from "@/components/ui/Controls";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Field, Input, Select } from "@/components/ui/Field";
import { saveEventSettingsAction } from "../../actions";

export interface SettingsValues extends EventFieldValues {
  capacity: string;
  maxTicketsPerOrder: number;
  maxTicketsPerBuyer?: number | null;
  presaleMaxTicketsPerBuyer?: number | null;
  version?: string;
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  hasAccessCode?: boolean;
  refundPolicy: "NON_REFUNDABLE" | "UNTIL_DEADLINE" | "ON_REQUEST" | "ALWAYS";
  refundDeadlineLocal: string;
  salesStartLocal: string;
  salesEndLocal: string;
  resaleEnabled: boolean;
  resaleCutoffHours: number;
  resaleWaitlistFirst: boolean;
  resaleWaitlistMinutes: number;
  showResaleSection: boolean;
}

/** RG-EVT-01 : sauvegarde automatique après une seconde sans modification, avec indicateur. */
export function SettingsForm({
  orgSlug,
  eventId,
  values,
  readOnly,
  venue,
  typeLimits = [],
  section,
}: {
  orgSlug: string;
  eventId: string;
  values: SettingsValues;
  venue?: PartnerVenueOption | null;
  readOnly: boolean;
  /** Limites par personne des tarifs, pour la phrase d'exemple des limites d'achat. */
  typeLimits?: { name: string; maxPerBuyer: number | null }[];
  /** Partie des réglages montrée (Général, Lieu, Vente) ; les autres champs restent chargés, masqués, pour être enregistrés. */
  section?: "general" | "venue" | "sales";
}) {
  const t = useTranslations("eventSettings");
  const locale = useLocale();
  // limites d'achat : phrase d'exemple qui suit la saisie (commande, personne, tarifs, prévente)
  const [lim, setLim] = useState({
    order: String(values.maxTicketsPerOrder),
    buyer: values.maxTicketsPerBuyer ? String(values.maxTicketsPerBuyer) : "",
    presale: values.presaleMaxTicketsPerBuyer
      ? String(values.presaleMaxTicketsPerBuyer)
      : "",
  });
  const num = (v: string) =>
    /^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null;
  const perType = typeLimits
    .filter((x) => x.maxPerBuyer)
    .map((x) => t("limitsPreviewType", { count: x.maxPerBuyer!, name: x.name }))
    .join(", ");
  const buyerLimit = num(lim.buyer);
  const orderLimit = num(lim.order) ?? values.maxTicketsPerOrder;
  const presaleLimit = num(lim.presale);
  // refonte A3 (maquette Réglages, Vente) : « Une même personne pourra acheter 10 billets au plus, en 2 commandes au moins. »
  const limitsPreview = [
    buyerLimit
      ? t("limitsExample", {
          buyer: buyerLimit,
          orders: Math.max(1, Math.ceil(buyerLimit / orderLimit)),
        })
      : t("limitsExampleNoBuyer", { order: orderLimit }),
    perType ? t("limitsPreviewTypesOnly", { list: perType }) : null,
    presaleLimit ? t("limitsPreviewPresale", { count: presaleLimit }) : null,
  ]
    .filter(Boolean)
    .join(" ");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState(
    saveEventSettingsAction.bind(null, orgSlug, eventId),
    null,
  );
  const error = useFieldError(state);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [visibility, setVisibility] = useState<SettingsValues["visibility"]>(
    values.visibility,
  );
  const [refundPolicy, setRefundPolicy] = useState(values.refundPolicy);
  // l'interrupteur « Remboursement sur demande » : la dernière façon de rembourser choisie revient quand on le rallume
  const [refundMode, setRefundMode] = useState<
    Exclude<SettingsValues["refundPolicy"], "NON_REFUNDABLE">
  >(
    values.refundPolicy !== "NON_REFUNDABLE"
      ? values.refundPolicy
      : values.refundDeadlineLocal
        ? "UNTIL_DEADLINE"
        : "ON_REQUEST",
  );
  const [deadline, setDeadline] = useState(values.refundDeadlineLocal);
  const [resaleMore, setResaleMore] = useState(false);
  // « jusqu'à 7 jours avant l'événement » : la date limite comptée en jours avant le début
  const daysBefore = (() => {
    if (!deadline || !values.startsAtLocal) return null;
    const ms =
      Date.parse(`${values.startsAtLocal.slice(0, 10)}T00:00Z`) -
      Date.parse(`${deadline.slice(0, 10)}T00:00Z`);
    return ms >= 0 ? Math.round(ms / 86_400_000) : null;
  })();
  const refundHint =
    refundMode === "UNTIL_DEADLINE" && daysBefore != null
      ? t("refundHintDays", { count: daysBefore })
      : t(`refundHint_${refundMode}`);
  const [resaleEnabled, setResaleEnabled] = useState(values.resaleEnabled);

  const schedule = () => {
    if (readOnly) return;
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!form.current) return;
      const data = new FormData(form.current);
      const hours = data.get("resaleCutoffHours");
      if (hours !== null)
        data.set(
          "resaleCutoffMinutes",
          String(Math.round(Number(hours || 0) * 60)),
        );
      startTransition(() => action(data));
      setDirty(false);
    }, 1000);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const status = pending
    ? tc("saving")
    : dirty
      ? t("unsaved")
      : state?.ok
        ? tc("saved")
        : state && !state.ok
          ? t("notSaved")
          : "";
  // RG-EVT-10 : version suivie d'une sauvegarde à l'autre ; avertissement si un autre membre a enregistré entre-temps
  const version = state?.ok ? state.data.version : values.version;
  const concurrent = state?.ok && state.data.concurrent;
  const saved = !pending && !dirty && !(state && !state.ok);
  return (
    <>
      {/* refonte A3 (maquette Réglages) : l'état d'enregistrement à droite des onglets en boutons, « Enregistré » en vert */}
      {section ? (
        <BarActions>
          {saved ? (
            <SavedNote id="save-status">{status || tc("saved")}</SavedNote>
          ) : (
            <span
              id="save-status"
              role="status"
              className="text-[13px] text-ink-muted"
            >
              {status}
            </span>
          )}
        </BarActions>
      ) : null}
      <form
        ref={form}
        onChange={schedule}
        onSubmit={(e) => e.preventDefault()}
        className={section ? "-mt-[18px] grid" : "grid gap-10"}
        noValidate
        aria-describedby="save-status"
      >
        <input type="hidden" name="version" value={version ?? ""} />
        {concurrent ? (
          <p
            role="alert"
            className="rounded-[8px] bg-warning-soft px-3 py-2.5 text-[13px] font-medium text-warning"
          >
            {t("concurrentEdit")}
          </p>
        ) : null}
        {section ? null : (
          <p
            id="save-status"
            role="status"
            className="text-[13px] text-ink-muted"
          >
            {status || t("autosave")}
          </p>
        )}
        <FormError state={state} />
        <fieldset disabled={readOnly} className="grid">
          <EventFields
            values={values}
            error={error}
            venue={venue}
            show={{
              essentials: !section || section === "general",
              location: !section || section === "venue",
            }}
          />

          {/* absents de la maquette Vente : la jauge commune et la visibilité de la page, avec l'essentiel (onglet Général) */}
          <SettingsRow
            fieldset
            hidden={!!section && section !== "general"}
            title={t("audienceTitle")}
            description={t("audienceDesc")}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t("capacity")}
                htmlFor="capacity"
                error={error("capacity")}
              >
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  defaultValue={values.capacity}
                  placeholder={t("capacityEmpty")}
                />
              </Field>
              <Field label={t("visibility")} htmlFor="visibility">
                <Select
                  id="visibility"
                  name="visibility"
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(
                      e.target.value as SettingsValues["visibility"],
                    )
                  }
                >
                  <option value="PUBLIC">{t("visibility_PUBLIC")}</option>
                  <option value="UNLISTED">{t("visibility_UNLISTED")}</option>
                  <option value="PRIVATE">{t("visibility_PRIVATE")}</option>
                </Select>
              </Field>
            </div>
            {visibility === "PRIVATE" ? (
              <Field
                label={t("accessCode")}
                htmlFor="accessCode"
                hint={
                  values.hasAccessCode
                    ? t("accessCodeKeep")
                    : t("accessCodeHint")
                }
                error={error("accessCode")}
              >
                <Input
                  id="accessCode"
                  name="accessCode"
                  autoComplete="off"
                  className="font-mono uppercase"
                  maxLength={32}
                  placeholder={values.hasAccessCode ? "••••••" : "GALA2026"}
                />
              </Field>
            ) : null}
          </SettingsRow>
          <div hidden={!!section && section !== "sales"}>
            <SettingsRow title={t("sectionSales")} description={t("salesDesc")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t("salesStart")}
                  htmlFor="salesStartLocal"
                  error={error("salesStartLocal")}
                >
                  <DateTimeField
                    id="salesStartLocal"
                    name="salesStartLocal"
                    locale={locale}
                    defaultValue={values.salesStartLocal}
                    placeholder={t("salesStartEmpty")}
                  />
                </Field>
                <Field
                  label={t("salesEnd")}
                  htmlFor="salesEndLocal"
                  error={error("salesEndLocal")}
                >
                  <DateTimeField
                    id="salesEndLocal"
                    name="salesEndLocal"
                    locale={locale}
                    defaultValue={values.salesEndLocal}
                    placeholder={t("salesEndEmpty")}
                  />
                </Field>
              </div>
            </SettingsRow>

            <SettingsRow title={t("limitsTitle")} description={t("limitsDesc")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t("maxTicketsPerOrder")}
                  htmlFor="maxTicketsPerOrder"
                  error={error("maxTicketsPerOrder")}
                >
                  <Suffixed suffix={t("ticketsSuffix")}>
                    <Input
                      id="maxTicketsPerOrder"
                      name="maxTicketsPerOrder"
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={values.maxTicketsPerOrder}
                      onChange={(e) =>
                        setLim((l) => ({ ...l, order: e.target.value }))
                      }
                    />
                  </Suffixed>
                </Field>
                <Field
                  label={t("maxTicketsPerBuyer")}
                  htmlFor="maxTicketsPerBuyer"
                  error={error("maxTicketsPerBuyer")}
                >
                  <Suffixed suffix={t("ticketsSuffix")}>
                    <Input
                      id="maxTicketsPerBuyer"
                      name="maxTicketsPerBuyer"
                      type="number"
                      min={1}
                      max={200}
                      defaultValue={values.maxTicketsPerBuyer ?? ""}
                      placeholder={t("noLimit")}
                      onChange={(e) =>
                        setLim((l) => ({ ...l, buyer: e.target.value }))
                      }
                    />
                  </Suffixed>
                </Field>
              </div>
              {/* absent de la maquette : la limite propre à la prévente, quand elle existe */}
              {values.presaleMaxTicketsPerBuyer || lim.presale ? (
                <Field
                  label={t("presaleMaxTicketsPerBuyer")}
                  htmlFor="presaleMaxTicketsPerBuyer"
                  hint={t("presaleMaxTicketsPerBuyerHint")}
                  error={error("presaleMaxTicketsPerBuyer")}
                >
                  <Input
                    id="presaleMaxTicketsPerBuyer"
                    name="presaleMaxTicketsPerBuyer"
                    type="number"
                    min={1}
                    max={200}
                    defaultValue={values.presaleMaxTicketsPerBuyer ?? ""}
                    onChange={(e) =>
                      setLim((l) => ({ ...l, presale: e.target.value }))
                    }
                  />
                </Field>
              ) : (
                <input
                  type="hidden"
                  name="presaleMaxTicketsPerBuyer"
                  value=""
                />
              )}
              <ExampleNote>
                <span role="status" aria-live="polite">
                  {limitsPreview}
                </span>
              </ExampleNote>
            </SettingsRow>

            <SettingsRow
              title={t("sectionRefunds")}
              description={t("refundsDesc")}
            >
              <SwitchRow
                label={t("refundSwitch")}
                hint={refundHint}
                checked={refundPolicy !== "NON_REFUNDABLE"}
                onChange={(e) =>
                  setRefundPolicy(
                    e.target.checked ? refundMode : "NON_REFUNDABLE",
                  )
                }
              />
              <input type="hidden" name="refundPolicy" value={refundPolicy} />
              {refundPolicy !== "UNTIL_DEADLINE" ? (
                <input
                  type="hidden"
                  name="refundDeadlineLocal"
                  value={deadline}
                />
              ) : null}
              {refundPolicy !== "NON_REFUNDABLE" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("refundMode")} htmlFor="refundMode">
                    <Select
                      id="refundMode"
                      value={refundMode}
                      onChange={(e) => {
                        const v = e.target.value as typeof refundMode;
                        setRefundMode(v);
                        setRefundPolicy(v);
                      }}
                    >
                      {(
                        ["ON_REQUEST", "UNTIL_DEADLINE", "ALWAYS"] as const
                      ).map((p) => (
                        <option key={p} value={p}>
                          {t(`refund_${p}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {refundPolicy === "UNTIL_DEADLINE" ? (
                    <Field
                      label={t("refundDeadline")}
                      htmlFor="refundDeadlineLocal"
                      error={error("refundDeadlineLocal")}
                    >
                      <DateTimeField
                        id="refundDeadlineLocal"
                        name="refundDeadlineLocal"
                        locale={locale}
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
              <SwitchRow
                name="resaleEnabled"
                label={t("resaleSwitch")}
                hint={
                  <>
                    {t("resaleSwitchHint")}
                    {/* les délais et la liste d'attente (absents de la maquette) : repliés, un clic les montre */}
                    {resaleEnabled && !resaleMore ? (
                      <>
                        {", "}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setResaleMore(true);
                          }}
                          className="underline underline-offset-[3px] hover:text-ink"
                        >
                          {t("resaleMore").toLowerCase()}
                        </button>
                      </>
                    ) : null}
                  </>
                }
                checked={resaleEnabled}
                onChange={(e) => setResaleEnabled(e.target.checked)}
              />
              <input
                type="hidden"
                name="resaleCutoffMinutes"
                value={values.resaleCutoffHours * 60}
              />
              {resaleEnabled && resaleMore ? (
                <div className="grid gap-3.5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label={t("resaleCutoff")}
                      htmlFor="resaleCutoffHours"
                      hint={t("resaleCutoffHint")}
                    >
                      <Input
                        id="resaleCutoffHours"
                        name="resaleCutoffHours"
                        type="number"
                        min={0}
                        max={168}
                        step={0.5}
                        defaultValue={values.resaleCutoffHours}
                      />
                    </Field>
                    <Field
                      label={t("resaleWaitlistMinutes")}
                      htmlFor="resaleWaitlistMinutes"
                      hint={t("resaleWaitlistHint")}
                    >
                      <Input
                        id="resaleWaitlistMinutes"
                        name="resaleWaitlistMinutes"
                        type="number"
                        min={5}
                        max={10080}
                        step={5}
                        defaultValue={values.resaleWaitlistMinutes}
                      />
                    </Field>
                  </div>
                  <SwitchRow
                    name="showResaleSection"
                    label={t("showResaleSection")}
                    defaultChecked={values.showResaleSection}
                  />
                  <SwitchRow
                    name="resaleWaitlistFirst"
                    label={t("resaleWaitlistFirst")}
                    defaultChecked={values.resaleWaitlistFirst}
                  />
                </div>
              ) : (
                // revente désactivée : ses réglages restent envoyés tels quels. Sans le délai, la validation refusait tout
                // l'enregistrement (jauge, dates, remboursements compris), et la priorité à la liste d'attente était effacée
                <>
                  <input
                    type="hidden"
                    name="showResaleSection"
                    value={values.showResaleSection ? "on" : ""}
                  />
                  <input
                    type="hidden"
                    name="resaleWaitlistFirst"
                    value={values.resaleWaitlistFirst ? "on" : ""}
                  />
                  <input
                    type="hidden"
                    name="resaleWaitlistMinutes"
                    value={values.resaleWaitlistMinutes}
                  />
                </>
              )}
            </SettingsRow>
          </div>
        </fieldset>
      </form>
    </>
  );
}

/** Champ avec son unité à droite (« billets »), comme la maquette (« .suf »). */
function Suffixed({
  suffix,
  children,
}: {
  suffix: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-[13px] -translate-y-1/2 text-[length:var(--field-text)] text-ink-muted"
      >
        {suffix}
      </span>
    </div>
  );
}
