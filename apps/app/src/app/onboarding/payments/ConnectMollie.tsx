"use client";

import { useTranslations } from "next-intl";
import {
  FormError,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/forms";
import { Field, Input } from "@/components/ui/Field";
import { connectMollieAction } from "../actions";

/**
 * Relier le compte Mollie de l'organisation (docs/MOLLIE.md) : le téléphone que Mollie exige pour le profil, puis la
 * création du compte chez Mollie ou la connexion à un compte existant. La mention des services de Mollie est
 * obligatoire avant toute inscription (conditions Mollie Connect, art. 8).
 */
export function ConnectMollie({
  orgSlug,
  from,
  phone,
}: {
  orgSlug: string;
  from: "onboarding" | "settings";
  phone: string | null;
}) {
  const t = useTranslations("mollie");
  const { state, formProps } = useActionForm(
    connectMollieAction.bind(null, orgSlug),
    null,
  );
  const fieldError = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-3">
      <FormError state={state} />
      <input type="hidden" name="from" value={from} />
      <Field
        label={t("phoneLabel")}
        htmlFor="mollie-phone"
        hint={t("phoneHint")}
        error={fieldError("phone")}
        required
      >
        <Input
          id="mollie-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={phone ?? ""}
          required
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="signup" value="1" variant="primary" className="">
          {t("createAccount")}
        </SubmitButton>
        <SubmitButton name="signup" value="0" variant="secondary" className="">
          {t("linkAccount")}
        </SubmitButton>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-muted">
        {t("disclosure")}
      </p>
    </form>
  );
}
