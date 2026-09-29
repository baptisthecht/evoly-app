"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { disableAction, enableAction, regenerateAction } from "./actions";

const input = "h-12 rounded-xl bg-surface px-4 text-center font-mono text-lg tracking-[0.2em] shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]";
const button = "h-12 rounded-full px-5 font-semibold";

function Codes({ codes }: { codes: string[] }) {
  const t = useTranslations("twoFactor");
  return (
    <div className="grid gap-2 rounded-md bg-warning-soft p-4" role="status">
      <p className="font-semibold">{t("codesTitle")}</p>
      <p className="text-sm">{t("codesBody")}</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="recovery-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

export function EnableForm() {
  const t = useTranslations("twoFactor");
  const [state, action, pending] = useActionState(enableAction, null);
  if (state?.codes) return <Codes codes={state.codes} />;
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-semibold">
        {t("code")}
        <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={input} />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-danger">{t(state.error)}</p> : null}
      <button type="submit" disabled={pending} className={`${button} bg-surface-inverse text-ink-inverse`}>
        {t("enable")}
      </button>
    </form>
  );
}

export function ManageForms({ staff }: { staff: boolean }) {
  const t = useTranslations("twoFactor");
  const [regen, regenAction, regenPending] = useActionState(regenerateAction, null);
  const [dis, disAction, disPending] = useActionState(disableAction, null);
  return (
    <div className="grid gap-6">
      {regen?.codes ? <Codes codes={regen.codes} /> : null}
      <form action={regenAction} className="grid gap-3">
        <p className="font-semibold">{t("regenerateTitle")}</p>
        <input name="code" aria-label={t("code")} inputMode="numeric" maxLength={8} className={input} />
        {regen?.error ? <p role="alert" className="text-sm text-danger">{t(regen.error)}</p> : null}
        <button type="submit" disabled={regenPending} className={`${button} shadow-[inset_0_0_0_1.5px_var(--line-strong)]`}>
          {t("regenerate")}
        </button>
      </form>
      {!staff ? (
        <form action={disAction} className="grid gap-3">
          <p className="font-semibold">{t("disableTitle")}</p>
          <input name="code" aria-label={t("codeOrRecovery")} maxLength={12} className={input} />
          {dis?.error ? <p role="alert" className="text-sm text-danger">{t(dis.error)}</p> : null}
          <button type="submit" disabled={disPending} className={`${button} text-danger`}>
            {t("disable")}
          </button>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">{t("staffRequired")}</p>
      )}
    </div>
  );
}

/**
 * Un seul composant, rendu au même endroit que la double authentification soit active ou non :
 * l'activation pose un cookie, la page se recharge, et les codes de secours (montrés une seule fois) restent affichés.
 */
export function TwoFactorPanel({ enabled, staff, setup, status }: { enabled: boolean; staff: boolean; setup: { qr: string; secret: string } | null; status: string }) {
  const t = useTranslations("twoFactor");
  const [state, action, pending] = useActionState(enableAction, null);
  return (
    <div className="grid gap-5">
      {state?.codes ? <Codes codes={state.codes} /> : null}
      {enabled ? (
        <>
          <p className="rounded-md bg-success-soft px-4 py-3 text-sm font-semibold text-success">{status}</p>
          <ManageForms staff={staff} />
        </>
      ) : setup ? (
        <>
          <p className="text-ink-muted">{t("intro")}</p>
          <div className="w-fit rounded-xl bg-blanc p-3" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <p className="text-sm text-ink-muted">
            {t("manualKey")} <code className="select-all break-all font-mono text-ink" data-testid="totp-secret">{setup.secret}</code>
          </p>
          <form action={action} className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-semibold">
              {t("code")}
              <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={input} />
            </label>
            {state?.error ? <p role="alert" className="text-sm text-danger">{t(state.error)}</p> : null}
            <button type="submit" disabled={pending} className={`${button} bg-surface-inverse text-ink-inverse`}>
              {t("enable")}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
