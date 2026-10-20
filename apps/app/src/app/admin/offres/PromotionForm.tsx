"use client";

import { useActionState } from "react";
import { FormError, SubmitButton, useFieldError } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/Field";
import { savePromotionAction } from "./actions";

const LOCALES = [
  ["fr", "Français"],
  ["en", "English"],
  ["nl", "Nederlands"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["it", "Italiano"],
  ["pt", "Português"],
] as const;
const TYPES = [
  ["ASSOCIATION", "Associations"],
  ["COMPANY", "Entreprises"],
  ["INDIVIDUAL", "Particuliers"],
  ["PUBLIC_BODY", "Organismes publics"],
] as const;

export interface PromotionFormValues {
  code: string;
  name: string;
  note: string;
  active: boolean;
  durationValue: number;
  durationUnit: "DAY" | "MONTH";
  startsAtLocal: string;
  endsAtLocal: string;
  audience: "ALL_NEW" | "LINK";
  countries: string;
  organizationTypes: string[];
  sources: string;
  maxRedemptions: string;
  perOwnerLimit: number;
  priority: number;
  showOnSite: boolean;
  messages: Record<string, { banner: string; short: string; cta: string }>;
}

/** Toutes les options d'une offre : durée, période, public, conditions, plafonds, priorité, textes par langue. */
export function PromotionForm({ id, values }: { id: string | null; values: PromotionFormValues }) {
  const [state, action, pending] = useActionState(savePromotionAction.bind(null, id), null);
  const error = useFieldError(state);
  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg">Campagne</legend>
        <Field label="Code de campagne" htmlFor="p-code" hint="Lien : app.evoly.me/start?offre=CODE" error={error("code")}>
          <Input id="p-code" name="code" required defaultValue={values.code} />
        </Field>
        <Field label="Nom interne" htmlFor="p-name" error={error("name")}>
          <Input id="p-name" name="name" required defaultValue={values.name} />
        </Field>
        <Field label="Note interne" htmlFor="p-note">
          <Input id="p-note" name="note" defaultValue={values.note} />
        </Field>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="active" defaultChecked={values.active} /> Active
        </label>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 font-display text-lg">Ce qui est offert</legend>
        <input type="hidden" name="planId" value="pro" />
        <Field label="Durée" htmlFor="p-duration" error={error("durationValue")}>
          <Input id="p-duration" name="durationValue" type="number" min={1} required defaultValue={values.durationValue} />
        </Field>
        <Field label="Unité" htmlFor="p-unit">
          <Select id="p-unit" name="durationUnit" defaultValue={values.durationUnit}>
            <option value="MONTH">mois de Pro</option>
            <option value="DAY">jours de Pro</option>
          </Select>
        </Field>
        <Field label="Priorité" htmlFor="p-priority" hint="La plus haute l'emporte" error={error("priority")}>
          <Input id="p-priority" name="priority" type="number" defaultValue={values.priority} />
        </Field>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg">Période (heure de Bruxelles)</legend>
        <Field label="Début" htmlFor="p-starts" hint="Vide : dès maintenant" error={error("startsAtLocal")}>
          <Input id="p-starts" name="startsAtLocal" type="datetime-local" defaultValue={values.startsAtLocal} />
        </Field>
        <Field label="Fin" htmlFor="p-ends" hint="Vide : sans fin" error={error("endsAtLocal")}>
          <Input id="p-ends" name="endsAtLocal" type="datetime-local" defaultValue={values.endsAtLocal} />
        </Field>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg">Public et conditions</legend>
        <Field label="Public" htmlFor="p-audience">
          <Select id="p-audience" name="audience" defaultValue={values.audience}>
            <option value="ALL_NEW">Toute nouvelle organisation</option>
            <option value="LINK">Seulement par le lien de la campagne</option>
          </Select>
        </Field>
        <Field label="Pays" htmlFor="p-countries" hint="Codes séparés par des virgules (BE, FR) ; vide : tous" error={error("countries")}>
          <Input id="p-countries" name="countries" defaultValue={values.countries} />
        </Field>
        <Field label="Sources de la visite" htmlFor="p-sources" hint="utm_source (google, newsletter) ; vide : toutes" error={error("sources")}>
          <Input id="p-sources" name="sources" defaultValue={values.sources} />
        </Field>
        <div className="grid gap-1 text-sm">
          <span className="font-label font-bold">Types d’organisation (aucun coché : tous)</span>
          {TYPES.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="checkbox" name="organizationTypes" value={v} defaultChecked={values.organizationTypes.includes(v)} /> {l}
            </label>
          ))}
        </div>
        <Field label="Nombre maximal d’organisations" htmlFor="p-max" hint="Vide : illimité" error={error("maxRedemptions")}>
          <Input id="p-max" name="maxRedemptions" type="number" min={1} defaultValue={values.maxRedemptions} />
        </Field>
        <Field label="Par organisateur" htmlFor="p-owner" error={error("perOwnerLimit")}>
          <Input id="p-owner" name="perOwnerLimit" type="number" min={1} required defaultValue={values.perOwnerLimit} />
        </Field>
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="mb-2 font-display text-lg">Textes affichés</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showOnSite" defaultChecked={values.showOnSite} /> Annoncer l’offre sur le site vitrine et à l’inscription
        </label>
        {LOCALES.map(([l, label]) => (
          <div key={l} className="grid gap-3 sm:grid-cols-3">
            <Field label={`${label} : bandeau`} htmlFor={`p-${l}-banner`} hint="L’offre et ses conditions, en une phrase" error={error(`msg_${l}_banner`)}>
              <Input id={`p-${l}-banner`} name={`msg_${l}_banner`} defaultValue={values.messages[l]?.banner ?? ""} />
            </Field>
            <Field label="Mention courte" htmlFor={`p-${l}-short`} error={error(`msg_${l}_short`)}>
              <Input id={`p-${l}-short`} name={`msg_${l}_short`} defaultValue={values.messages[l]?.short ?? ""} />
            </Field>
            <Field label="Bouton" htmlFor={`p-${l}-cta`} error={error(`msg_${l}_cta`)}>
              <Input id={`p-${l}-cta`} name={`msg_${l}_cta`} defaultValue={values.messages[l]?.cta ?? ""} />
            </Field>
          </div>
        ))}
      </fieldset>
      <FormError state={state} />
      <SubmitButton pending={pending}>Enregistrer l’offre</SubmitButton>
    </form>
  );
}
