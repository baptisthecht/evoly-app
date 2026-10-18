import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/(auth)/actions";
import { LocaleSwitch } from "../LocaleSwitch";
import { InstallAppButton } from "../pwa/InstallAppButton";

export async function AccountMenu({ name, email }: { name: string; email: string }) {
  const [t, tp] = await Promise.all([getTranslations("nav"), getTranslations("pwa")]);
  return (
    <div className="grid gap-2 px-1 pt-1">
      <div className="min-w-0">
        <p className="truncate text-[0.84rem] font-semibold">{name}</p>
        <p className="truncate text-[0.75rem] text-ink-muted">{email}</p>
      </div>
      <LocaleSwitch className="justify-self-start" align="start" direction="up" />
      <InstallAppButton label={tp("install")} iosHint={tp("iosHint")} />
      <form action={logoutAction}>
        <button className="h-8 w-full rounded-lg px-2.5 text-left text-[0.8rem] font-medium whitespace-nowrap text-ink-muted hover:bg-surface-sunken hover:text-ink">
          {t("logout")}
        </button>
      </form>
    </div>
  );
}
