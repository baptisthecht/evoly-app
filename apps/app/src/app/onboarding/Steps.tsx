import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui/cn";

export async function Steps({ current }: { current: 1 | 2 | 3 }) {
  const t = await getTranslations("onboarding");
  const steps = [t("stepOrganization"), t("stepPayments"), t("stepFirstEvent")];
  return (
    <ol className="mb-8 flex gap-2" aria-label={t("stepsLabel")}>
      {steps.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex-1" aria-current={n === current ? "step" : undefined}>
            <span className={cn("block h-1.5 rounded-full", n <= current ? "bg-ink" : "bg-line-strong")} />
            <span className={cn("mt-2 block font-label text-[0.72rem] font-bold", n === current ? "text-ink" : "text-ink-subtle")}>
              {n}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
