import { useTranslations } from "next-intl";
import { Badge } from "../ui/Card";

const TONES = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  SCHEDULED: "info",
  SALES_PAUSED: "warning",
  CANCELLED: "danger",
  ENDED: "neutral",
  ARCHIVED: "neutral",
} as const;
type Status = Exclude<keyof typeof TONES, "SCHEDULED">;

/**
 * Statut d'un événement (refonte A3, maquettes UIUX/) : « En vente » en vert, « Programmé » (publié, ventes pas encore
 * ouvertes) en bleu, « Brouillon » en gris, avec leur point ; « Terminé » et « Archivé » en simple étiquette, sans point.
 */
export function EventStatusBadge({
  status,
  salesStartAt,
}: {
  status: Status;
  /** Ouverture des ventes : publié avant cette date, l'événement est « Programmé ». */
  salesStartAt?: Date | null;
}) {
  const t = useTranslations("events.status");
  const shown =
    status === "PUBLISHED" &&
    salesStartAt &&
    salesStartAt.getTime() > Date.now()
      ? "SCHEDULED"
      : status;
  return (
    <Badge tone={TONES[shown]} dot={shown !== "ENDED" && shown !== "ARCHIVED"}>
      {t(shown)}
    </Badge>
  );
}
