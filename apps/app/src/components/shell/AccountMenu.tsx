import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/(auth)/actions";
import { LocaleSwitch } from "../LocaleSwitch";

export async function AccountMenu({ name, email }: { name: string; email: string }) {
  const t = await getTranslations("nav");
  return (
    <div className="grid gap-3 border-t border-white/10 pt-4">
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-sm text-creme/60">{email}</p>
      </div>
      <LocaleSwitch className="justify-self-start bg-blanc/10! [&_button[aria-pressed=false]]:text-creme/70" />
      <form action={logoutAction}>
        <button className="h-10 w-full rounded-full px-4 text-left text-sm font-semibold whitespace-nowrap text-creme/80 hover:bg-blanc/10 hover:text-creme">{t("logout")}</button>
      </form>
    </div>
  );
}
