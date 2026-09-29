import { useTranslations } from "next-intl";
import { Badge } from "../ui/Card";

const TONES = { DRAFT: "neutral", PUBLISHED: "success", SALES_PAUSED: "warning", CANCELLED: "danger", ENDED: "dark", ARCHIVED: "neutral" } as const;

export function EventStatusBadge({ status }: { status: keyof typeof TONES }) {
  const t = useTranslations("events.status");
  return <Badge tone={TONES[status]}>{t(status)}</Badge>;
}
