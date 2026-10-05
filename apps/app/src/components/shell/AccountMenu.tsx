import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/(auth)/actions";
import { LocaleSwitch } from "../LocaleSwitch";
import { InstallAppButton } from "../pwa/InstallAppButton";

export async function AccountMenu({ name, email }: { name: string; email: string }) {
  const [t, tp] = await Promise.all([getTranslations("nav"), getTranslations("pwa")]);
  return (
    <div className="grid gap-3 border-t border-white/10 pt-4">
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-sm text-creme/60">{email}</p>
      </div>
      <LocaleSwitch className="justify-self-start" align="start" direction="up" />
      <InstallAppButton label={tp("install")} iosHint={tp("iosHint")} />
      <form action={logoutAction}>
        <button className="h-10 w-full rounded-full px-4 text-left text-sm font-semibold whitespace-nowrap text-creme/80 hover:bg-blanc/10 hover:text-creme">{t("logout")}</button>
      </form>
    </div>
  );
}
